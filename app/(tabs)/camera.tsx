import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, LayoutChangeEvent, FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TextRecognition, { TextRecognitionScript } from '@react-native-ml-kit/text-recognition';

import {
  TileSet, TileCategory, TILE_CATEGORIES,
  loadTileSets, cropTileRegion, classifyTile, guideRectToPhotoCrop,
} from '@/utils/tileSets';
import { isTileVisionAvailable } from 'tile-vision';
import { analyzeTiles, TileRecognitionResult } from '@/utils/tileRecognition';
import { PATTERNS } from '@/utils/scoring';

export const CAMERA_PREFILL_KEY = 'camera_prefill';

// ─── Constants ────────────────────────────────────────────────────────────────

const TILE_COUNT = 16;

// Guide overlay: horizontal strip with TILE_COUNT cells
const GUIDE_MARGIN_H = 16;
const GUIDE_HEIGHT    = 100;

// ─── Types ────────────────────────────────────────────────────────────────────

type ScreenState = 'preview' | 'analyzing' | 'results' | 'error';

export interface TileRegionResult {
  uri: string;                          // cropped tile image
  category: TileCategory | null;        // detected category
  confidence: 'high' | 'low' | 'ocr';  // how we got the answer
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef  = useRef<CameraView>(null);

  // View layout — needed to map guide coords to photo coords
  const [viewDim, setViewDim] = useState<{ width: number; height: number } | null>(null);

  const [screenState, setScreenState] = useState<ScreenState>('preview');
  const [sets, setSets] = useState<TileSet[]>([]);
  const [activeSetsId, setActiveSetId] = useState<string | null>(null);
  const [showSetPicker, setShowSetPicker] = useState(false);
  const [tileResults, setTileResults] = useState<TileRegionResult[]>([]);
  const [ocrResult, setOcrResult] = useState<TileRecognitionResult | null>(null);

  const [isFocused, setIsFocused] = useState(false);

  useFocusEffect(useCallback(() => {
    setIsFocused(true);
    loadTileSets().then(loaded => {
      setSets(loaded);
      // Auto-select the first complete set if none selected
      setActiveSetId(prev => {
        if (prev && loaded.find(s => s.id === prev)) return prev;
        return loaded.find(s => Object.keys(s.fingerprints ?? {}).length >= 3)?.id ?? null;
      });
    });
    return () => setIsFocused(false); // release camera hardware on tab blur
  }, []));

  const activeSet = sets.find(s => s.id === activeSetsId) ?? null;
  const hasFingerprints = isTileVisionAvailable()
    && activeSet != null
    && Object.keys(activeSet.fingerprints ?? {}).length >= 3;

  function handleViewLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setViewDim({ width, height });
  }

  // ── Capture & analyse ──────────────────────────────────────────────────────

  async function handleCapture() {
    if (!cameraRef.current || !viewDim) return;
    setScreenState('analyzing');

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo) throw new Error('No photo returned');

      // Build guide rect in screen space
      const guideX = GUIDE_MARGIN_H;
      const guideY = (viewDim.height - GUIDE_HEIGHT) / 2;
      const guideW = viewDim.width - GUIDE_MARGIN_H * 2;

      // Convert to photo pixel coordinates
      const photoCrop = guideRectToPhotoCrop(
        { x: guideX, y: guideY, width: guideW, height: GUIDE_HEIGHT },
        viewDim,
        { width: photo.width, height: photo.height },
      );

      // Cell width in photo pixels; we crop the center 80% of each cell
      const cellW     = photoCrop.width / TILE_COUNT;
      const innerW    = Math.round(cellW * 0.8);
      const innerH    = photoCrop.height;
      const cellPadX  = Math.round((cellW - innerW) / 2);

      // Run OCR on the full image for flowers / honors
      const ocrPromise = TextRecognition.recognize(photo.uri, TextRecognitionScript.CHINESE)
        .then(r => analyzeTiles(r.text))
        .catch(() => null);

      // Crop and classify each tile region
      const regions: TileRegionResult[] = await Promise.all(
        Array.from({ length: TILE_COUNT }, async (_, i) => {
          const crop = {
            originX: photoCrop.originX + Math.round(i * cellW) + cellPadX,
            originY: photoCrop.originY,
            width:   innerW,
            height:  innerH,
          };

          let uri: string;
          try {
            uri = await cropTileRegion(photo.uri, crop);
          } catch {
            return { uri: photo.uri, category: null, confidence: 'low' as const };
          }

          if (hasFingerprints && activeSet) {
            const match = await classifyTile(uri, activeSet);
            if (match) {
              return { uri, category: match.category, confidence: match.confidence };
            }
          }

          return { uri, category: null, confidence: 'low' as const };
        }),
      );

      const ocr = await ocrPromise;
      setTileResults(regions);
      setOcrResult(ocr);
      setScreenState('results');
    } catch {
      setScreenState('error');
    }
  }

  function handleRetake() {
    setScreenState('preview');
    setTileResults([]);
    setOcrResult(null);
  }

  function handleUpdateTileCategory(index: number, category: TileCategory) {
    setTileResults(prev => prev.map((r, i) => i === index ? { ...r, category, confidence: 'low' } : r));
  }

  async function handleScoreHand() {
    // Derive scoring pre-fills from the tile regions + OCR
    const cats = tileResults.map(r => r.category).filter(Boolean) as TileCategory[];

    const flowerCount   = ocrResult?.flowerCount ?? cats.filter(c => c === 'flower').length;
    const hasHonors     = ocrResult?.hasHonors   ?? cats.some(c => c === 'wind' || c === 'dragon');

    const suitTiles     = cats.filter(c => c === 'characters' || c === 'bamboo' || c === 'balls');
    const uniqueSuits   = new Set(suitTiles);
    const isPureOneSuit = uniqueSuits.size === 1 && !hasHonors;
    const isOneSuitWithHonors = uniqueSuits.size === 1 && hasHonors;

    const patternIds: string[] = [];
    if (isPureOneSuit)       patternIds.push('qing_yi_se');
    if (isOneSuitWithHonors) patternIds.push('cou_yi_se');

    await AsyncStorage.setItem(CAMERA_PREFILL_KEY, JSON.stringify({
      flowerCount,
      noHonors: !hasHonors,
      patternIds,
    }));
    router.navigate('/(tabs)/index' as never);
  }

  // ─── Permission gate ─────────────────────────────────────────────────────────

  if (!permission) return <View style={S.root} />;

  if (!permission.granted) {
    return (
      <View style={[S.root, S.centered, { paddingTop: insets.top }]}>
        <Text style={S.gateText}>Camera access is needed to scan tiles</Text>
        <TouchableOpacity style={S.primaryBtn} onPress={requestPermission}>
          <Text style={S.primaryBtnTxt}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Analyzing ───────────────────────────────────────────────────────────────

  if (screenState === 'analyzing') {
    return (
      <View style={[S.root, S.centered]}>
        <ActivityIndicator size="large" color="#8B0000" />
        <Text style={S.analyzingText}>Reading tiles…</Text>
      </View>
    );
  }

  // ─── Error ───────────────────────────────────────────────────────────────────

  if (screenState === 'error') {
    return (
      <View style={[S.root, S.centered, { paddingTop: insets.top }]}>
        <Text style={S.gateText}>Couldn't read the tiles. Make sure all 16 tiles are inside the guide.</Text>
        <TouchableOpacity style={S.secondaryBtn} onPress={handleRetake}>
          <Text style={S.secondaryBtnTxt}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Results ─────────────────────────────────────────────────────────────────

  if (screenState === 'results') {
    const suggestedPatternIds = (() => {
      const cats     = tileResults.map(r => r.category).filter(Boolean) as TileCategory[];
      const hasHonors = ocrResult?.hasHonors ?? cats.some(c => c === 'wind' || c === 'dragon');
      const suitTiles = cats.filter(c => c === 'characters' || c === 'bamboo' || c === 'balls');
      const uniqueSuits = new Set(suitTiles);
      const ids: string[] = [];
      if (uniqueSuits.size === 1 && !hasHonors) ids.push('qing_yi_se');
      if (uniqueSuits.size === 1 && hasHonors)  ids.push('cou_yi_se');
      return ids;
    })();

    return (
      <ScrollView
        style={S.resultsContainer}
        contentContainerStyle={[S.resultsContent, { paddingTop: insets.top + 12 }]}
      >
        <View style={S.titleRow}>
          <Text style={S.title}>Results</Text>
          <View style={S.betaBadge}><Text style={S.betaText}>BETA</Text></View>
        </View>

        {/* Tile strip — 16 thumbnails, tap to change category */}
        <Text style={S.sectionTitle}>Detected tiles  (tap any to correct)</Text>
        <FlatList
          data={tileResults}
          horizontal
          keyExtractor={(_, i) => String(i)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={S.tileStrip}
          renderItem={({ item, index }) => (
            <TileThumb
              item={item}
              index={index}
              onPress={handleUpdateTileCategory}
            />
          )}
        />

        {/* OCR-derived info */}
        <Text style={S.sectionTitle}>Also detected</Text>
        <View style={S.chipRow}>
          <View style={S.chip}>
            <Text style={S.chipText}>
              🌸 {(ocrResult?.flowerCount ?? 0) > 0
                ? `${ocrResult!.flowerCount} flower${ocrResult!.flowerCount > 1 ? 's' : ''}`
                : 'No flowers'}
            </Text>
          </View>
          <View style={S.chip}>
            <Text style={S.chipText}>
              {ocrResult?.hasHonors ? '🀄 Honor tiles present' : '✓ No honor tiles'}
            </Text>
          </View>
        </View>

        {suggestedPatternIds.length > 0 && (
          <>
            <Text style={S.sectionTitle}>Suggested patterns</Text>
            {suggestedPatternIds.map(id => {
              const p = PATTERNS.find(p => p.id === id);
              if (!p) return null;
              return (
                <View key={id} style={S.patternRow}>
                  <View style={S.patternInfo}>
                    <Text style={S.patternEnglish}>{p.english}</Text>
                    <Text style={S.patternChinese}>{p.chinese}  {p.pinyin}</Text>
                  </View>
                  <Text style={S.patternTai}>{p.tai} tai</Text>
                </View>
              );
            })}
          </>
        )}

        <Text style={S.confirmNote}>
          You can review and adjust everything on the next screen.
        </Text>

        <TouchableOpacity style={S.primaryBtn} onPress={handleScoreHand}>
          <Text style={S.primaryBtnTxt}>Score This Hand →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[S.secondaryBtn, { marginTop: 12 }]} onPress={handleRetake}>
          <Text style={S.secondaryBtnTxt}>Retake</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ─── Camera preview ───────────────────────────────────────────────────────────

  return (
    <View style={S.root} onLayout={handleViewLayout}>
      {isFocused && <CameraView ref={cameraRef} style={S.camera} facing="back">

        {/* Top bar — always rendered, child count of CameraView must stay fixed */}
        <View style={[S.topBar, { paddingTop: insets.top + 8 }]}>
          <Text style={S.topBarTitle}>Camera Score</Text>
          <View style={S.topBarRight}>
            <View style={S.betaBadge}><Text style={S.betaText}>BETA</Text></View>
            <TouchableOpacity
              style={S.setsBtn}
              onPress={() => setShowSetPicker(v => !v)}
            >
              <Text style={S.setsBtnText} numberOfLines={1}>
                {activeSet ? activeSet.name : 'No set'}
              </Text>
              <Text style={S.setsBtnChevron}>▾</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Framing guide — always rendered (empty view when viewDim not ready) */}
        <GridGuide viewDim={viewDim} hasFingerprints={!!hasFingerprints} />

        {/* Bottom capture button — always rendered */}
        <View style={[S.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
          {!hasFingerprints && (
            <Text style={S.noSetWarning}>
              {sets.length === 0 ? 'Create a tile set for best results' : 'Set incomplete — using text recognition only'}
            </Text>
          )}
          <TouchableOpacity style={S.captureBtn} onPress={handleCapture} disabled={!viewDim}>
            <View style={S.captureBtnInner} />
          </TouchableOpacity>
        </View>

      </CameraView>}

      {/* Dropdown rendered OUTSIDE CameraView — conditional children inside a
          native camera view cause Fabric index-mismatch crashes on New Arch */}
      {isFocused && showSetPicker && (
        <View style={[S.setPickerDropdown, { top: insets.top + 60 }]}>
          {sets.length === 0 ? (
            <TouchableOpacity
              style={S.setPickerItem}
              onPress={() => { setShowSetPicker(false); router.push('/manage-sets'); }}
            >
              <Text style={S.setPickerItemTxt}>Create a tile set first →</Text>
            </TouchableOpacity>
          ) : (
            sets.map(s => {
              const fpCount = Object.keys(s.fingerprints ?? {}).length;
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[S.setPickerItem, s.id === activeSetsId && S.setPickerItemActive]}
                  onPress={() => { setActiveSetId(s.id); setShowSetPicker(false); }}
                >
                  <Text style={[S.setPickerItemTxt, s.id === activeSetsId && S.setPickerItemActiveTxt]}>
                    {s.name}
                  </Text>
                  <Text style={S.setPickerItemMeta}>
                    {fpCount >= 3 ? `${fpCount} refs` : 'incomplete'}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
          <TouchableOpacity
            style={[S.setPickerItem, { borderTopWidth: 1, borderTopColor: '#f0f0f0' }]}
            onPress={() => { setShowSetPicker(false); router.push('/manage-sets'); }}
          >
            <Text style={[S.setPickerItemTxt, { color: '#8B0000' }]}>Manage tile sets…</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── GridGuide ────────────────────────────────────────────────────────────────

function GridGuide({
  viewDim,
  hasFingerprints,
}: {
  viewDim: { width: number; height: number } | null;
  hasFingerprints: boolean;
}) {
  // Return empty view instead of null — returning null changes CameraView's
  // child count which triggers a Fabric index-mismatch crash (New Arch).
  if (!viewDim) return <View />;

  const guideW = viewDim.width - GUIDE_MARGIN_H * 2;
  const cellW  = guideW / TILE_COUNT;
  const borderColor = hasFingerprints ? 'rgba(255,255,255,0.75)' : 'rgba(255,200,50,0.75)';

  return (
    <View
      style={[
        S.guide,
        {
          left:   GUIDE_MARGIN_H,
          width:  guideW,
          height: GUIDE_HEIGHT,
          top:    (viewDim.height - GUIDE_HEIGHT) / 2,
          borderColor,
        },
      ]}
    >
      {/* Cell dividers */}
      {Array.from({ length: TILE_COUNT - 1 }, (_, i) => (
        <View
          key={i}
          style={[S.guideDivider, { left: Math.round((i + 1) * cellW), borderColor }]}
        />
      ))}
      {/* Label */}
      <View style={S.guideLabelBox}>
        <Text style={S.guideLabelTxt}>Align all 16 tiles inside</Text>
      </View>
    </View>
  );
}

// ─── TileThumb ────────────────────────────────────────────────────────────────

const CATEGORY_PICKER_ORDER: TileCategory[] = [
  'characters', 'bamboo', 'balls', 'wind', 'dragon', 'flower',
];

function TileThumb({
  item,
  index,
  onPress,
}: {
  item: TileRegionResult;
  index: number;
  onPress: (index: number, cat: TileCategory) => void;
}) {
  const [picking, setPicking] = useState(false);
  const cat = TILE_CATEGORIES.find(c => c.key === item.category);

  return (
    <View style={S.thumbWrap}>
      <TouchableOpacity onPress={() => setPicking(v => !v)} activeOpacity={0.8}>
        <Image source={{ uri: item.uri }} style={S.thumbImg} contentFit="cover" />
        <View style={[S.thumbLabel, item.confidence === 'low' && S.thumbLabelLow]}>
          <Text style={S.thumbLabelTxt} numberOfLines={1}>
            {cat ? cat.chinese : '?'}
          </Text>
        </View>
      </TouchableOpacity>

      {picking && (
        <View style={S.thumbPicker}>
          {CATEGORY_PICKER_ORDER.map(key => {
            const c = TILE_CATEGORIES.find(t => t.key === key)!;
            return (
              <TouchableOpacity
                key={key}
                style={[S.thumbPickerItem, key === item.category && S.thumbPickerItemActive]}
                onPress={() => { onPress(index, key); setPicking(false); }}
              >
                <Text style={S.thumbPickerTxt}>{c.chinese}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#000' },
  centered: { justifyContent: 'center', alignItems: 'center', gap: 20, padding: 32 },
  camera:   { flex: 1 },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  topBarTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  betaBadge:   { backgroundColor: '#8B0000', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  betaText:    { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  setsBtn:     {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4, maxWidth: 160,
  },
  setsBtnText:    { color: '#fff', fontSize: 12, fontWeight: '600', flex: 1 },
  setsBtnChevron: { color: '#fff', fontSize: 10 },

  // Set picker dropdown
  setPickerDropdown: {
    position: 'absolute', right: 16,
    backgroundColor: '#fff', borderRadius: 12,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    minWidth: 200, zIndex: 100,
    overflow: 'hidden',
  },
  setPickerItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  setPickerItemActive:    { backgroundColor: '#fdf0f0' },
  setPickerItemTxt:       { fontSize: 14, color: '#222', fontWeight: '500' },
  setPickerItemActiveTxt: { color: '#8B0000', fontWeight: '700' },
  setPickerItemMeta:      { fontSize: 11, color: '#aaa' },

  // Framing guide
  guide: {
    position: 'absolute',
    borderWidth: 2, borderRadius: 8,
    borderStyle: 'dashed',
  },
  guideDivider: {
    position: 'absolute', top: 0, bottom: 0,
    width: 1, borderLeftWidth: 1, borderStyle: 'dashed', opacity: 0.5,
  },
  guideLabelBox: {
    position: 'absolute', bottom: -26, left: 0, right: 0, alignItems: 'center',
  },
  guideLabelTxt: {
    color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '500',
    backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10,
  },

  // Bottom bar
  bottomBar: {
    alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', paddingTop: 20, gap: 10,
  },
  noSetWarning: {
    color: 'rgba(255,200,50,0.9)', fontSize: 12, fontWeight: '600', textAlign: 'center',
    paddingHorizontal: 24,
  },
  captureBtn: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  captureBtnInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },

  // Results
  resultsContainer: { flex: 1, backgroundColor: '#f5f0e8' },
  resultsContent:   { padding: 20, paddingBottom: 60 },
  titleRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20, marginTop: 12 },
  title:     { fontSize: 28, fontWeight: '700', color: '#8B0000' },
  sectionTitle: {
    fontSize: 12, fontWeight: '600', color: '#888',
    marginTop: 20, marginBottom: 10,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

  // Tile strip
  tileStrip:  { gap: 6, paddingRight: 8 },
  thumbWrap:  { position: 'relative' },
  thumbImg:   { width: 52, height: 72, borderRadius: 6 },
  thumbLabel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,100,0,0.75)',
    borderBottomLeftRadius: 6, borderBottomRightRadius: 6,
    alignItems: 'center', paddingVertical: 2,
  },
  thumbLabelLow: { backgroundColor: 'rgba(180,100,0,0.75)' },
  thumbLabelTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  thumbPicker: {
    position: 'absolute', top: 76, left: -10, zIndex: 50,
    backgroundColor: '#fff', borderRadius: 8,
    flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 6,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    width: 130,
  },
  thumbPickerItem: {
    width: 36, height: 36, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f5f0e8',
  },
  thumbPickerItemActive: { backgroundColor: '#8B0000' },
  thumbPickerTxt: { fontSize: 16, fontWeight: '700', color: '#222' },

  // Chips / patterns
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: '#fff', borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#eee',
  },
  chipText: { fontSize: 14, color: '#333', fontWeight: '500' },
  patternRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10,
    padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#eee',
  },
  patternInfo:     { flex: 1 },
  patternEnglish:  { fontSize: 15, fontWeight: '600', color: '#222' },
  patternChinese:  { fontSize: 12, color: '#888', marginTop: 2 },
  patternTai:      { fontSize: 15, fontWeight: '700', color: '#8B0000', marginLeft: 10 },
  confirmNote: {
    textAlign: 'center', color: '#aaa', fontSize: 13,
    fontStyle: 'italic', marginTop: 24, marginBottom: 8, lineHeight: 20,
  },

  // Shared buttons
  primaryBtn:    { marginTop: 8, backgroundColor: '#8B0000', borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  primaryBtnTxt: { color: '#fff', fontSize: 17, fontWeight: '700' },
  secondaryBtn:  { borderRadius: 14, paddingVertical: 16, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  secondaryBtnTxt: { color: '#555', fontSize: 16, fontWeight: '600' },

  // Gates
  gateText:     { fontSize: 16, color: '#ddd', textAlign: 'center', lineHeight: 24 },
  analyzingText: { fontSize: 16, color: '#888', marginTop: 12 },
});
