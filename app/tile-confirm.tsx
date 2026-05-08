import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { TILE_CLASS_MAP, BONUS_CODES, HONOR_CODES } from '@/constants/tileMap';
import { DetectedTile, PendingDetection } from '@/types/tiles';
import { CAMERA_PREFILL_KEY } from './(tabs)/camera';
import { PENDING_DETECTION_KEY } from './(tabs)/camera';
import TilePicker from '@/components/TilePicker';

type PickerContext =
  | { mode: 'add';  section: 'hand' | 'bonus' }
  | { mode: 'edit'; section: 'hand' | 'bonus'; index: number }
  | null;

function getImageFit(photoW: number, photoH: number, cW: number, cH: number) {
  const scale = Math.min(cW / photoW, cH / photoH);
  const rW = photoW * scale, rH = photoH * scale;
  return { left: (cW - rW) / 2, top: (cH - rH) / 2, scale };
}

export default function TileConfirmScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [photoUri, setPhotoUri]     = useState('');
  const [photoWidth, setPhotoWidth]   = useState(1);
  const [photoHeight, setPhotoHeight] = useState(1);
  const [handTiles, setHandTiles]   = useState<DetectedTile[]>([]);
  const [bonusTiles, setBonusTiles] = useState<DetectedTile[]>([]);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  const [pickerContext, setPickerContext] = useState<PickerContext>(null);

  useEffect(() => {
    AsyncStorage.getItem(PENDING_DETECTION_KEY).then(raw => {
      if (!raw) { router.back(); return; }
      const pending: PendingDetection = JSON.parse(raw);
      setPhotoUri(pending.photoUri);
      setPhotoWidth(pending.photoWidth);
      setPhotoHeight(pending.photoHeight);
      setHandTiles(pending.tiles.filter(t => !t.isBonus));
      setBonusTiles(pending.tiles.filter(t => t.isBonus));
      AsyncStorage.removeItem(PENDING_DETECTION_KEY);
      setLoading(false);
    });
  }, []);

  function removeTile(section: 'hand' | 'bonus', index: number) {
    if (section === 'hand') setHandTiles(prev => prev.filter((_, i) => i !== index));
    else                    setBonusTiles(prev => prev.filter((_, i) => i !== index));
  }

  function handleTilePicked(classCode: string) {
    if (!pickerContext) return;
    const isBonus = BONUS_CODES.has(classCode);
    const tile: DetectedTile = {
      classCode,
      className: TILE_CLASS_MAP[classCode] ?? classCode,
      confidence: 1,
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      isBonus,
    };
    if (pickerContext.mode === 'add') {
      if (pickerContext.section === 'hand')  setHandTiles(prev => [...prev, tile]);
      else                                   setBonusTiles(prev => [...prev, tile]);
    } else {
      if (pickerContext.section === 'hand')
        setHandTiles(prev => prev.map((t, i) => i === pickerContext.index ? tile : t));
      else
        setBonusTiles(prev => prev.map((t, i) => i === pickerContext.index ? tile : t));
    }
    setPickerContext(null);
  }

  function handleScoreHand() {
    const flowerCount = bonusTiles.length;
    const noHonors    = !handTiles.some(t => HONOR_CODES.has(t.classCode));

    const suitLetters = handTiles
      .map(t => (t.classCode.length === 2 && 'BCD'.includes(t.classCode[1])) ? t.classCode[1] : null)
      .filter((s): s is string => s !== null);
    const uniqueSuits  = new Set(suitLetters);
    const honorsInHand = handTiles.filter(t => HONOR_CODES.has(t.classCode)).length;

    const patternIds: string[] = [];
    if (uniqueSuits.size === 1 && honorsInHand === 0 && suitLetters.length === handTiles.length)
      patternIds.push('qing_yi_se');
    else if (uniqueSuits.size === 1 && honorsInHand > 0)
      patternIds.push('cou_yi_se');

    AsyncStorage.setItem(CAMERA_PREFILL_KEY, JSON.stringify({ flowerCount, noHonors, patternIds }));
    router.navigate('/' as never);
  }

  if (loading) {
    return (
      <View style={[S.root, S.centered]}>
        <ActivityIndicator size="large" color="#8B0000" />
      </View>
    );
  }

  const fit = containerSize
    ? getImageFit(photoWidth, photoHeight, containerSize.width, containerSize.height)
    : null;

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>
      {/* Photo with bounding boxes */}
      <View
        style={S.photoContainer}
        onLayout={e => setContainerSize({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })}
      >
        <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="contain" />
        {fit && [...handTiles, ...bonusTiles].map((tile, i) => {
          if (tile.bbox.width === 0) return null;
          const left  = fit.left + (tile.bbox.x - tile.bbox.width  / 2) * fit.scale;
          const top   = fit.top  + (tile.bbox.y - tile.bbox.height / 2) * fit.scale;
          const width  = tile.bbox.width  * fit.scale;
          const height = tile.bbox.height * fit.scale;
          const color  = tile.confidence > 0.8 ? '#00cc44' : '#ffcc00';
          return (
            <View key={i} style={[S.bbox, { left, top, width, height, borderColor: color }]}>
              <Text style={[S.bboxLabel, { backgroundColor: color }]}>{tile.classCode}</Text>
            </View>
          );
        })}
      </View>

      {/* Tile lists */}
      <ScrollView style={S.scroll} contentContainerStyle={S.scrollContent}>
        {/* Hand tiles */}
        <View style={S.sectionHeader}>
          <Text style={S.sectionTitle}>Hand: {handTiles.length}/17 tiles</Text>
          <TouchableOpacity
            style={S.addBtn}
            onPress={() => setPickerContext({ mode: 'add', section: 'hand' })}
          >
            <Text style={S.addBtnTxt}>+ Add</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={S.tileRow}>
            {handTiles.map((tile, i) => (
              <TileCard
                key={i}
                tile={tile}
                onEdit={() => setPickerContext({ mode: 'edit', section: 'hand', index: i })}
                onRemove={() => removeTile('hand', i)}
              />
            ))}
            {handTiles.length === 0 && <Text style={S.emptyNote}>No hand tiles detected</Text>}
          </View>
        </ScrollView>

        {/* Bonus tiles */}
        <View style={[S.sectionHeader, { marginTop: 16 }]}>
          <Text style={S.sectionTitle}>Bonus tiles: {bonusTiles.length}</Text>
          <TouchableOpacity
            style={S.addBtn}
            onPress={() => setPickerContext({ mode: 'add', section: 'bonus' })}
          >
            <Text style={S.addBtnTxt}>+ Add</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={S.tileRow}>
            {bonusTiles.map((tile, i) => (
              <TileCard
                key={i}
                tile={tile}
                onEdit={() => setPickerContext({ mode: 'edit', section: 'bonus', index: i })}
                onRemove={() => removeTile('bonus', i)}
              />
            ))}
            {bonusTiles.length === 0 && <Text style={S.emptyNote}>No bonus tiles</Text>}
          </View>
        </ScrollView>

        <Text style={S.confirmNote}>
          Tap any tile to change it, or tap ✕ to remove a false detection.
          Flowers and seasons go in Bonus tiles.
        </Text>

        <TouchableOpacity style={S.scoreBtn} onPress={handleScoreHand}>
          <Text style={S.scoreBtnTxt}>Score This Hand →</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[S.retakeBtn, { marginTop: 10 }]} onPress={() => router.back()}>
          <Text style={S.retakeBtnTxt}>Retake Photo</Text>
        </TouchableOpacity>
      </ScrollView>

      <TilePicker
        visible={pickerContext !== null}
        onSelect={handleTilePicked}
        onClose={() => setPickerContext(null)}
      />
    </View>
  );
}

function TileCard({ tile, onEdit, onRemove }: {
  tile: DetectedTile;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const confColor = tile.confidence > 0.8 ? '#00aa33' : tile.confidence > 0.5 ? '#cc8800' : '#888';
  return (
    <View style={TC.wrap}>
      <TouchableOpacity style={TC.inner} onPress={onEdit} activeOpacity={0.7}>
        <Text style={TC.code}>{tile.classCode}</Text>
        <Text style={TC.name} numberOfLines={2}>{tile.className}</Text>
        <Text style={[TC.conf, { color: confColor }]}>{Math.round(tile.confidence * 100)}%</Text>
      </TouchableOpacity>
      <TouchableOpacity style={TC.remove} onPress={onRemove} hitSlop={6}>
        <Text style={TC.removeTxt}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const S = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#f5f0e8' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  photoContainer: {
    height: 220, backgroundColor: '#111',
    position: 'relative',
  },
  bbox: {
    position: 'absolute',
    borderWidth: 2, borderRadius: 3,
  },
  bboxLabel: {
    position: 'absolute', top: 0, left: 0,
    fontSize: 9, fontWeight: '800', color: '#000',
    paddingHorizontal: 3, paddingVertical: 1, borderRadius: 2,
  },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.6 },
  addBtn: {
    backgroundColor: '#8B0000', borderRadius: 8,
    paddingVertical: 5, paddingHorizontal: 12,
  },
  addBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },

  tileRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  emptyNote: { color: '#bbb', fontSize: 13, fontStyle: 'italic', padding: 8 },

  confirmNote: {
    color: '#aaa', fontSize: 12, fontStyle: 'italic',
    textAlign: 'center', lineHeight: 18, marginTop: 20, marginBottom: 8,
  },
  scoreBtn: {
    backgroundColor: '#8B0000', borderRadius: 14,
    paddingVertical: 18, alignItems: 'center', marginTop: 4,
  },
  scoreBtnTxt: { color: '#fff', fontSize: 17, fontWeight: '700' },
  retakeBtn: {
    borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd',
  },
  retakeBtnTxt: { color: '#555', fontSize: 15, fontWeight: '600' },
});

const TC = StyleSheet.create({
  wrap: { width: 72, position: 'relative' },
  inner: {
    backgroundColor: '#fff', borderRadius: 10,
    padding: 8, alignItems: 'center', borderWidth: 1, borderColor: '#eee',
    minHeight: 80,
  },
  code: { fontSize: 16, fontWeight: '800', color: '#8B0000' },
  name: { fontSize: 9, color: '#666', textAlign: 'center', marginTop: 3, lineHeight: 12 },
  conf: { fontSize: 9, fontWeight: '600', marginTop: 4 },
  remove: {
    position: 'absolute', top: -6, right: -6,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#888', alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  removeTxt: { color: '#fff', fontSize: 10, fontWeight: '700', lineHeight: 12 },
});
