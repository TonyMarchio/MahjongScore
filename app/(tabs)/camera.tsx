import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { detectTiles } from '@/services/roboflowService';
import { PendingDetection } from '@/types/tiles';

export const PENDING_DETECTION_KEY = 'roboflow_pending_detection';
export const CAMERA_PREFILL_KEY    = 'camera_prefill';

type ScreenState = 'preview' | 'analyzing' | 'error';
type ErrorKind = 'network' | 'no_tiles' | 'api_key' | 'unknown';

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [screenState, setScreenState] = useState<ScreenState>('preview');
  const [errorKind, setErrorKind] = useState<ErrorKind>('unknown');
  const [isFocused, setIsFocused] = useState(false);

  useFocusEffect(useCallback(() => {
    setIsFocused(true);
    return () => setIsFocused(false);
  }, []));

  async function analyzePhoto(uri: string) {
    setScreenState('analyzing');
    try {
      const resized = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );

      const tiles = await detectTiles(resized.base64!);

      if (tiles.length === 0) {
        setErrorKind('no_tiles');
        setScreenState('error');
        return;
      }

      const pending: PendingDetection = {
        photoUri: resized.uri,
        photoWidth: resized.width,
        photoHeight: resized.height,
        tiles,
      };
      await AsyncStorage.setItem(PENDING_DETECTION_KEY, JSON.stringify(pending));
      router.push('/tile-confirm' as never);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'MISSING_KEY' || msg === 'INVALID_KEY') {
        setErrorKind('api_key');
      } else if (msg.startsWith('API_ERROR_')) {
        setErrorKind('network');
      } else {
        setErrorKind('network');
      }
      setScreenState('error');
    }
  }

  async function handleCapture() {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
    if (!photo) return;
    await analyzePhoto(photo.uri);
  }

  async function handlePickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;
    await analyzePhoto(result.assets[0].uri);
  }

  function handleRetry() {
    setScreenState('preview');
  }

  if (!permission) return <View style={S.root} />;

  if (!permission.granted) {
    return (
      <View style={[S.root, S.centered, { paddingTop: insets.top }]}>
        <Text style={S.gateTitle}>Camera Access Needed</Text>
        <Text style={S.gateBody}>Allow camera access to scan and identify your mahjong tiles.</Text>
        <TouchableOpacity style={S.primaryBtn} onPress={requestPermission}>
          <Text style={S.primaryBtnTxt}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (screenState === 'analyzing') {
    return (
      <View style={[S.root, S.centered]}>
        <ActivityIndicator size="large" color="#8B0000" />
        <Text style={S.analyzingTitle}>Detecting tiles…</Text>
        <Text style={S.analyzingBody}>Sending to Roboflow AI</Text>
      </View>
    );
  }

  if (screenState === 'error') {
    const msgs: Record<ErrorKind, { title: string; body: string }> = {
      no_tiles: {
        title: 'No Tiles Detected',
        body: 'Make sure tiles are face-up, well-lit, and clearly visible in the frame.',
      },
      api_key: {
        title: 'API Key Problem',
        body: 'Check that EXPO_PUBLIC_ROBOFLOW_API_KEY is set correctly in your .env file.',
      },
      network: {
        title: "Couldn't Reach Detection Server",
        body: 'Check your internet connection and try again.',
      },
      unknown: {
        title: 'Something Went Wrong',
        body: 'An unexpected error occurred. Please try again.',
      },
    };
    const { title, body } = msgs[errorKind];
    return (
      <View style={[S.root, S.centered, { paddingTop: insets.top }]}>
        <Text style={S.gateTitle}>{title}</Text>
        <Text style={S.gateBody}>{body}</Text>
        <TouchableOpacity style={S.primaryBtn} onPress={handleRetry}>
          <Text style={S.primaryBtnTxt}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[S.secondaryBtn, { marginTop: 12 }]} onPress={handlePickFromLibrary}>
          <Text style={S.secondaryBtnTxt}>Pick from Library</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={S.root}>
      {isFocused && (
        <CameraView ref={cameraRef} style={S.camera} facing="back">
          <View style={[S.topBar, { paddingTop: insets.top + 8 }]}>
            <Text style={S.topBarTitle}>Camera Score</Text>
          </View>

          <View style={S.instructionWrap}>
            <Text style={S.instructionText}>
              Arrange your winning hand face-up and take a photo
            </Text>
          </View>

          <View style={[S.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
            <TouchableOpacity style={S.libraryBtn} onPress={handlePickFromLibrary}>
              <Text style={S.libraryBtnTxt}>Library</Text>
            </TouchableOpacity>

            <TouchableOpacity style={S.captureBtn} onPress={handleCapture}>
              <View style={S.captureBtnInner} />
            </TouchableOpacity>

            <View style={S.libraryBtn} />
          </View>
        </CameraView>
      )}
    </View>
  );
}

const S = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#000' },
  camera:  { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center', gap: 16, padding: 32, backgroundColor: '#f5f0e8' },

  topBar: {
    paddingHorizontal: 20, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  topBarTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },

  instructionWrap: {
    flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 40,
  },
  instructionText: {
    color: '#fff', fontSize: 14, fontWeight: '500', textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20,
    overflow: 'hidden',
  },

  bottomBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 32, paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  libraryBtn: {
    width: 60, height: 60, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  libraryBtnTxt: { color: '#fff', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  captureBtn: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  captureBtnInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },

  analyzingTitle: { fontSize: 20, fontWeight: '700', color: '#222', marginTop: 16 },
  analyzingBody:  { fontSize: 14, color: '#888', marginTop: 4 },

  gateTitle: { fontSize: 22, fontWeight: '700', color: '#8B0000', textAlign: 'center' },
  gateBody:  { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 22 },

  primaryBtn:    { backgroundColor: '#8B0000', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32, alignItems: 'center', marginTop: 8 },
  primaryBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn:  { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  secondaryBtnTxt: { color: '#555', fontSize: 15, fontWeight: '600' },
});
