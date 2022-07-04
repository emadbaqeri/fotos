import React, { useEffect, useRef, useState, useContext } from "react"
import { Alert } from "react-native"
import * as MediaLibrary from "expo-media-library"
import { useRecoilState } from "recoil"

import { AssetService } from "../../services"
import { color } from "../../theme"
import AssetList from "../../components/asset-list"
import { useFloatHederAnimation } from "../../utils/hooks"
import { palette } from "../../theme/palette"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { HomeNavigationParamList, HomeNavigationTypes } from "../../navigators/home-navigator"
import { mediasState, recyclerSectionsState } from "../../store"
import { Assets } from "../../services/localdb"
import { Entities } from "../../realmdb"
import { AssetListScreen } from "../index"
interface HomeScreenProps {
  navigation: NativeStackNavigationProp<HomeNavigationParamList, HomeNavigationTypes>
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const [isReady, setIsReady] = useState(false)
  const realmAssets = useRef<Realm.Results<Entities.AssetEntity & Realm.Object>>(null);
  const [medias, setMedias] = useRecoilState(mediasState)
  const [loading, setLoading] = useState(true)
  const [recyclerSections, setRecyclerSections] = useRecoilState(recyclerSectionsState)
  // Get a custom hook to animate the header
  const [scrollY, headerStyles] = useFloatHederAnimation(60)

  const requestAndroidPermission = async () => {
    try {
      console.log("requestAndroidPermission")
      await MediaLibrary.requestPermissionsAsync(true)
    } catch (err) {
      Alert.alert("Request permission", JSON.stringify(err))
      console.warn(err)
    } finally {
      setIsReady(true)
    }
  }

  useEffect(() => {
    requestAndroidPermission();
  }, [])

  useEffect(() => {
    if (isReady) {
      (async () => {
        realmAssets.current = await Assets.getAll();
        realmAssets.current.addListener(onLocalDbAssetChange)
        const assets = []
        for (const asset of realmAssets.current) {
          assets.push(asset)
        }
        setMedias(assets)
        syncAssets(assets?.[0]?.modificationTime, assets?.[assets.length - 1]?.modificationTime)
        // remove listener after screen disposed
        return () => {
          realmAssets.current?.removeAllListeners();
        }
      })();
    }
  }, [isReady])

  const onLocalDbAssetChange = (collection: Realm.Collection<Entities.AssetEntity>, changes: Realm.CollectionChangeSet) => {
    setMedias(prev => {
      let assets = [...prev];
      if (changes.deletions?.length) {
        assets = assets.filter((_, index) => !changes.deletions.some(i => i === index))
        return [...assets]
      }
      if (changes.insertions?.length) {
        changes.insertions.map(index => {
          assets.push(collection[index])
        })
        return assets;
      }
      if(changes.newModifications?.length){
        assets = []
        for (const asset of collection) {
          assets.push(asset)
        }
        return assets;
      }
      return prev
    })
  }

  const syncAssets = async (lastAssetTime = 0, firstAssetTime = new Date().getTime()) => {
    try {
      let first = 20
      let allMedias: MediaLibrary.PagedInfo<MediaLibrary.Asset> = null
      let lastAsset: MediaLibrary.Asset = null;
      let fitstAsset: MediaLibrary.Asset = null;
      do {
        allMedias = await AssetService.getMedias(first, allMedias?.endCursor)
        assetsArray.push(...allMedias.assets)
        setRecyclerSections([...AssetService.categorizeAssets(assetsArray)])
        setMedias([...assetsArray])
        console.log(
          "allMedias",
          assetsArray.length,
          allMedias.assets.length,
          allMedias.hasNextPage,
          allMedias.endCursor,
          assetsArray[assetsArray.length - 1]?.id,
        )
        if (!allMedias.hasNextPage) break
        first = first * 4
        lastAsset = allMedias.assets?.[allMedias.assets.length - 1];

        // Repeat the loop if the first asset's date in the storage is less than the first asset's date in the local DB
      } while (allMedias.hasNextPage && (lastAsset?.modificationTime > lastAssetTime || fitstAsset?.modificationTime < firstAssetTime))
    } catch (error) {
      console.error("syncAssets:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen
      scrollEventThrottle={16}
      automaticallyAdjustContentInsets
      style={styles.screen}
      backgroundColor={color.transparent}
    >
      {!recyclerSections ? (
        <View style={styles.loaderContainer}>
          <LottieView
            autoPlay={true}
            loop={true}
            source={require("../../../assets/lotties/photo-loading.json")}
          />
          <Text style={styles.loadingText}>Gathering photos</Text>
        </View>
      ) : !recyclerSections?.length ? (
        <Text style={styles.emptyText}>Gallery is empty!</Text>
      ) : (
        <>
          <AssetList sections={recyclerSections} scrollY={scrollY} navigation={navigation} />
        </>
      )}
    </Screen>
  )
}