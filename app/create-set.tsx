import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  TileSet, TileCategory, TILE_CATEGORIES,
  loadTileSets, saveTileSets, persistTileImage, precomputeFingerprints,
  guideRectToPhotoCrop, cropTileRegion, normalizePhotoOrientation,
} from '@/utils/tileSets';

type Step = 'name' | TileCategory | 'summary';

// Target box shown in the camera viewfinder — user centers the tile face here
const TILE_GUIDE_W = 160;
const TILE_GUIDE_H = 220;

export default function CreateSetScreen() {
  const insets = useSafeAreaInsets();
  const { editId, editName } = useLocalSearchParams<{ editId?: string; editName?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [name, setName]         = useState(editName ?? '');
  const [step, setStep]         = useState<Step>('name');
  const [captures, setCaptures] = useState<Partial<Record<TileCategory, string>>>({});
  const [preview, setPreview]   = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [viewDim, setViewDim]   = useState<{ width: number; height: number } | null>(null);
  const pendingPhoto = useRef<{ uri: string; width: number; height: number } | null>(null);

  // When editing, pre-load existing references
  useEffect(() => {
    if (!editId) return;
    loadTileSets().then(sets => {
      const existing = sets.find(s => s.id === editId);
      if (existing) setCaptures({ ...existing.references });
    });
  }, [editId]);

  const stepIndex = step === 'name' ? -1
    : step === 'summary' ? TILE_CATEGORIES.length
    : TILE_CATEGORIES.findIndex(c => c.key === step);

  const currentCat = (step !== 'name' && step !== 'summary')
    ? TILE_CATEGORIES.find(c => c.key === step)
    : null;

  function goNext() {
    if (step === 'name') { setStep(TILE_CATEGORIES[0].key); return; }
    const idx = TILE_CATEGORIES.findIndex(c => c.key === step);
    setPreview(null);
    setStep(idx < TILE_CATEGORIES.length - 1 ? TILE_CATEGORIES[idx + 1].key : 'summary');
  }

  function goBack() {
    if (step === 'summary') { setStep(TILE_CATEGORIES[TILE_CATEGORIES.length - 1].key); setPreview(null); return; }
    const idx = TILE_CATEGORIES.findIndex(c => c.key === step);
    setPreview(null);
    setStep(idx === 0 ? 'name' : TILE_CATEGORIES[idx - 1].key);
  }

  async function handleCapture() {
    if (!cameraRef.current || !viewDim) return;
    try {
      const raw = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!raw) return;
      const photo = await normalizePhotoOrientation(raw.uri);
      pendingPhoto.current = { uri: photo.uri, width: photo.width, height: photo.height };
      setPreview(photo.uri);
    } catch {
      Alert.alert('Error', 'Could not take photo — try again.');
    }
  }

  async function handleUsePhoto() {
    if (!preview || !currentCat || !viewDim) return;
    const photo = pendingPhoto.current;
    let finalUri = preview;
    if (photo) {
      try {
        const guideX = (viewDim.width  - TILE_GUIDE_W) / 2;
        const guideY = (viewDim.height - TILE_GUIDE_H) / 2;
        const photoCrop = guideRectToPhotoCrop(
          { x: guideX, y: guideY, width: TILE_GUIDE_W, height: TILE_GUIDE_H },
          viewDim,
          { width: photo.width, height: photo.height },
        );
        finalUri = await cropTileRegion(photo.uri, photoCrop);
      } catch { /* fall back to full photo */ }
    }
    setCaptures(prev => ({ ...prev, [currentCat.key]: finalUri }));
    pendingPhoto.current = null;
    setPreview(null);
    goNext();
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Name required', 'Give this set a name first.'); return; }
    setSaving(true);
    try {
      const id = editId ?? Date.now().toString();
      const savedRefs: Partial<Record<TileCategory, string>> = {};
      for (const [cat, uri] of Object.entries(captures) as [TileCategory, string][]) {
        // If it's already a persistent path (editing), keep it; otherwise copy it
        if (uri.startsWith('file:///') && uri.includes('tile-sets')) {
          savedRefs[cat] = uri;
        } else {
          savedRefs[cat] = await persistTileImage(uri, id, cat);
        }
      }
      let newSet: TileSet = { id, name: name.trim(), createdAt: new Date().toISOString(), references: savedRefs };
      const existing = await loadTileSets();

      // Preserve existing fingerprints for categories that weren't re-captured during edit
      if (editId) {
        const prev = existing.find(s => s.id === editId);
        if (prev?.fingerprints) newSet = { ...newSet, fingerprints: { ...prev.fingerprints } };
      }

      // Pre-compute fingerprints for all reference images (runs in background after nav)
      const updated = editId
        ? existing.map(s => s.id === editId ? newSet : s)
        : [newSet, ...existing];
      await saveTileSets(updated);
      router.back();

      // Fire-and-forget: update fingerprints after nav so the UI feels instant
      precomputeFingerprints(newSet).then(async withFp => {
        const current = await loadTileSets();
        await saveTileSets(current.map(s => s.id === withFp.id ? withFp : s));
      }).catch(() => { /* non-fatal — falls back to OCR */ });
    } catch (e) {
      console.error('[CreateSet] save failed:', e);
      Alert.alert('Error', `Could not save — ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  // ── Step: Name entry ─────────────────────────────────────────────────────────

  if (step === 'name') {
    return (
      <View style={[S.page, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity onPress={() => router.back()} style={S.cancelBtn}>
          <Text style={S.cancelTxt}>Cancel</Text>
        </TouchableOpacity>
        <Text style={S.heading}>{editId ? 'Edit Tile Set' : 'New Tile Set'}</Text>
        <Text style={S.subheading}>
          Name this set so you can tell it apart when using the camera scorer.
        </Text>
        <TextInput
          style={S.nameInput}
          placeholder="e.g. Stephen's set"
          placeholderTextColor="#bbb"
          value={name}
          onChangeText={setName}
          autoFocus
          returnKeyType="next"
          onSubmitEditing={() => name.trim() && goNext()}
        />
        <Text style={S.hint}>
          Next you'll photograph one example tile from each category (characters, bamboo, balls, wind, dragon, flower). You can skip any you don't have.
        </Text>
        <TouchableOpacity
          style={[S.primaryBtn, !name.trim() && S.btnDisabled]}
          onPress={() => name.trim() && goNext()}
          disabled={!name.trim()}
        >
          <Text style={S.primaryBtnTxt}>Next: Capture Tiles →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Step: Summary ────────────────────────────────────────────────────────────

  if (step === 'summary') {
    const capturedCount = TILE_CATEGORIES.filter(c => captures[c.key]).length;
    return (
      <View style={[S.page, { paddingTop: insets.top + 20 }]}>
        <Text style={S.heading}>Review</Text>
        <Text style={S.subheading}>
          "{name}" — {capturedCount}/6 categories captured.
          {capturedCount < 6 ? '\nYou can fill in the rest later by editing the set.' : ''}
        </Text>
        <View style={S.summaryGrid}>
          {TILE_CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.key}
              style={S.summaryItem}
              onPress={() => { setStep(cat.key); setPreview(null); }}
            >
              {captures[cat.key]
                ? <Image source={{ uri: captures[cat.key] }} style={S.summaryThumb} contentFit="cover" />
                : <View style={[S.summaryThumb, S.summaryEmpty]}>
                    <Text style={S.summaryEmptyChar}>{cat.chinese}</Text>
                  </View>
              }
              <Text style={S.summaryLbl}>{cat.label}</Text>
              <Text style={captures[cat.key] ? S.summaryDone : S.summaryMissing}>
                {captures[cat.key] ? '✓' : 'tap to add'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[S.primaryBtn, saving && S.btnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={S.primaryBtnTxt}>{saving ? 'Saving…' : 'Save Set'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={S.secondaryBtn} onPress={goBack}>
          <Text style={S.secondaryBtnTxt}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Camera permission gate ────────────────────────────────────────────────────

  if (!permission) return <View style={S.cameraRoot} />;

  if (!permission.granted) {
    return (
      <View style={[S.cameraRoot, S.centered, { paddingTop: insets.top }]}>
        <Text style={S.gateText}>Camera access is needed to photograph tiles</Text>
        <TouchableOpacity style={S.primaryBtn} onPress={requestPermission}>
          <Text style={S.primaryBtnTxt}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Step: Photo preview (confirm / retake) ────────────────────────────────────

  if (preview) {
    return (
      <View style={S.cameraRoot}>
        <Image source={{ uri: preview }} style={S.previewFull} contentFit="cover" />
        <View style={[S.previewOverlay, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={S.previewTitle}>Use this photo?</Text>
          <Text style={S.previewSub}>{currentCat?.label} ({currentCat?.chinese})</Text>
          <TouchableOpacity style={S.primaryBtn} onPress={handleUsePhoto}>
            <Text style={S.primaryBtnTxt}>Use This →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.secondaryBtn} onPress={() => setPreview(null)}>
            <Text style={S.secondaryBtnTxt}>Retake</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Step: Live camera capture ─────────────────────────────────────────────────

  return (
    <View style={S.cameraRoot} onLayout={e => setViewDim(e.nativeEvent.layout)}>
      <CameraView ref={cameraRef} style={S.camera} facing="back">

        {/* Tile target guide */}
        <View style={S.tileGuide} pointerEvents="none" />

        {/* Progress dots */}
        <View style={[S.progressRow, { paddingTop: insets.top + 12 }]}>
          {TILE_CATEGORIES.map((cat, i) => (
            <View
              key={cat.key}
              style={[
                S.dot,
                i < stepIndex && S.dotDone,
                i === stepIndex && S.dotActive,
              ]}
            />
          ))}
        </View>

        {/* Instruction */}
        <View style={S.instructionBox}>
          <Text style={S.instructionChinese}>{currentCat?.chinese}</Text>
          <Text style={S.instructionLabel}>{currentCat?.label}</Text>
          <Text style={S.instructionHint}>{currentCat?.hint}</Text>
          {captures[currentCat?.key as TileCategory] && (
            <Text style={S.alreadyCaptured}>✓ Already captured — retake or skip</Text>
          )}
        </View>

        {/* Camera controls */}
        <View style={[S.cameraControls, { paddingBottom: insets.bottom + 28 }]}>
          <TouchableOpacity style={S.navBtn} onPress={goBack}>
            <Text style={S.navBtnTxt}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.captureBtn} onPress={handleCapture}>
            <View style={S.captureBtnInner} />
          </TouchableOpacity>
          <TouchableOpacity style={S.navBtn} onPress={goNext}>
            <Text style={S.navBtnTxt}>Skip →</Text>
          </TouchableOpacity>
        </View>

      </CameraView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  // Non-camera pages
  page:      { flex: 1, backgroundColor: '#f5f0e8', padding: 24 },
  cancelBtn: { marginBottom: 20 },
  cancelTxt: { fontSize: 15, color: '#8B0000', fontWeight: '600' },
  heading:   { fontSize: 26, fontWeight: '800', color: '#222', marginBottom: 10 },
  subheading:{ fontSize: 15, color: '#666', lineHeight: 22, marginBottom: 24 },
  hint:      { fontSize: 13, color: '#aaa', lineHeight: 20, marginBottom: 28, fontStyle: 'italic' },

  nameInput: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 17, borderWidth: 1, borderColor: '#ddd', marginBottom: 16,
  },

  primaryBtn:    { backgroundColor: '#8B0000', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  primaryBtnTxt: { color: '#fff', fontSize: 17, fontWeight: '700' },
  secondaryBtn:  { borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  secondaryBtnTxt: { color: '#555', fontSize: 16, fontWeight: '600' },
  btnDisabled:   { opacity: 0.4 },

  // Summary grid
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28 },
  summaryItem: { width: '30%', alignItems: 'center' },
  summaryThumb:    { width: 72, height: 72, borderRadius: 10, marginBottom: 6, overflow: 'hidden' },
  summaryEmpty:    { backgroundColor: '#f0ebe3', borderWidth: 1, borderColor: '#e0d8cc', alignItems: 'center', justifyContent: 'center' },
  summaryEmptyChar:{ fontSize: 24, fontWeight: '700', color: '#c8b89a' },
  summaryLbl:   { fontSize: 11, color: '#555', textAlign: 'center', fontWeight: '600' },
  summaryDone:  { fontSize: 11, color: '#2a7a2a', fontWeight: '700', marginTop: 2 },
  summaryMissing: { fontSize: 10, color: '#aaa', marginTop: 2 },

  // Camera screens
  cameraRoot: { flex: 1, backgroundColor: '#000' },
  centered:   { justifyContent: 'center', alignItems: 'center', gap: 20, padding: 32 },
  camera:     { flex: 1 },
  gateText:   { fontSize: 16, color: '#ddd', textAlign: 'center', lineHeight: 24 },
  tileGuide: {
    position: 'absolute',
    width: TILE_GUIDE_W, height: TILE_GUIDE_H,
    top: '50%', left: '50%',
    marginTop: -(TILE_GUIDE_H / 2), marginLeft: -(TILE_GUIDE_W / 2),
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 10, borderStyle: 'dashed',
  },

  // Progress dots
  progressRow:   { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingBottom: 12 },
  dot:           { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotActive:     { backgroundColor: '#fff', width: 24, borderRadius: 4 },
  dotDone:       { backgroundColor: 'rgba(255,255,255,0.7)' },

  // Instruction overlay
  instructionBox: {
    alignItems: 'center', paddingHorizontal: 32, marginTop: 32,
  },
  instructionChinese: { fontSize: 64, fontWeight: '900', color: '#fff', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8 },
  instructionLabel:   { fontSize: 20, fontWeight: '700', color: '#fff', marginTop: 4 },
  instructionHint:    { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 8, textAlign: 'center', lineHeight: 20 },
  alreadyCaptured:    { fontSize: 13, color: '#7dff7d', marginTop: 10, fontWeight: '600' },

  // Camera controls
  cameraControls: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 32, paddingTop: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  navBtn:    { width: 72, alignItems: 'center' },
  navBtnTxt: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' },
  captureBtn: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  captureBtnInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },

  // Photo preview
  previewFull:    { flex: 1 },
  previewOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', padding: 24,
  },
  previewTitle: { fontSize: 20, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 4 },
  previewSub:   { fontSize: 14, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginBottom: 20 },
});
