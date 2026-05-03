import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { generateFingerprint, computeDistance } from 'tile-vision';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TileCategory = 'characters' | 'bamboo' | 'balls' | 'wind' | 'dragon' | 'flower';

export interface TileSet {
  id: string;
  name: string;
  createdAt: string;
  references: Partial<Record<TileCategory, string>>;    // persistent file paths
  fingerprints?: Partial<Record<TileCategory, string>>; // base64 VNFeaturePrintObservation blobs
}

// ─── Category metadata ────────────────────────────────────────────────────────

export const TILE_CATEGORIES: {
  key: TileCategory;
  label: string;
  chinese: string;
  hint: string;
}[] = [
  { key: 'characters', label: 'Character tile', chinese: '萬', hint: 'Any 1–9 character (萬) tile' },
  { key: 'bamboo',     label: 'Bamboo tile',    chinese: '竹', hint: 'Any bamboo / sticks tile' },
  { key: 'balls',      label: 'Ball tile',       chinese: '餅', hint: 'Any circles / balls tile' },
  { key: 'wind',       label: 'Wind tile',       chinese: '風', hint: 'Any wind tile — East, South, West, or North' },
  { key: 'dragon',     label: 'Dragon tile',     chinese: '字', hint: 'Any dragon tile — 中, 發, or 白' },
  { key: 'flower',     label: 'Flower tile',     chinese: '花', hint: 'Any flower or season tile' },
];

// Honor categories — tiles we can detect via OCR rather than appearance
export const HONOR_CATEGORIES: TileCategory[] = ['wind', 'dragon'];

// Suit categories — tiles we need visual fingerprinting to reliably identify
export const SUIT_CATEGORIES: TileCategory[] = ['characters', 'bamboo', 'balls'];

// ─── Storage ──────────────────────────────────────────────────────────────────

const SETS_KEY = 'mahjong_tile_sets';
const SETS_DIR = `${FileSystem.documentDirectory}tile-sets/`;

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(SETS_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(SETS_DIR, { intermediates: true });
}

export async function loadTileSets(): Promise<TileSet[]> {
  const raw = await AsyncStorage.getItem(SETS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export async function saveTileSets(sets: TileSet[]): Promise<void> {
  await AsyncStorage.setItem(SETS_KEY, JSON.stringify(sets));
}

export async function persistTileImage(
  tempUri: string,
  setId: string,
  category: TileCategory,
): Promise<string> {
  await ensureDir();
  const dest = `${SETS_DIR}${setId}_${category}.jpg`;
  await FileSystem.copyAsync({ from: tempUri, to: dest });
  return dest;
}

// ─── Fingerprint helpers ──────────────────────────────────────────────────────

/**
 * Pre-computes Vision fingerprints for all reference images in a tile set.
 * Call this after saving a new/edited set. Returns the updated set.
 */
export async function precomputeFingerprints(set: TileSet): Promise<TileSet> {
  const fingerprints: Partial<Record<TileCategory, string>> = { ...set.fingerprints };
  for (const cat of TILE_CATEGORIES.map(c => c.key)) {
    const uri = set.references[cat];
    if (!uri) continue;
    try {
      fingerprints[cat] = await generateFingerprint(uri);
    } catch {
      // Silently skip — set can still work with OCR fallback
    }
  }
  return { ...set, fingerprints };
}

/**
 * Classifies a single tile image URI against a set's stored fingerprints.
 * Returns the closest TileCategory, or null if the set has no fingerprints.
 */
export async function classifyTile(
  tileUri: string,
  set: TileSet,
  candidateCategories?: TileCategory[],
): Promise<{ category: TileCategory; confidence: 'high' | 'low' } | null> {
  if (!set.fingerprints) return null;

  const categories = candidateCategories ?? TILE_CATEGORIES.map(c => c.key);
  const available = categories.filter(cat => set.fingerprints![cat]);
  if (available.length === 0) return null;

  let tileFingerprint: string;
  try {
    tileFingerprint = await generateFingerprint(tileUri);
  } catch {
    return null;
  }

  let bestCategory: TileCategory = available[0];
  let bestDistance = Infinity;
  let secondBestDistance = Infinity;

  for (const cat of available) {
    const refFp = set.fingerprints![cat]!;
    try {
      const dist = await computeDistance(tileFingerprint, refFp);
      if (dist < bestDistance) {
        secondBestDistance = bestDistance;
        bestDistance = dist;
        bestCategory = cat;
      } else if (dist < secondBestDistance) {
        secondBestDistance = dist;
      }
    } catch {
      continue;
    }
  }

  // High confidence if the best match is clearly better than the runner-up
  const margin = secondBestDistance - bestDistance;
  const confidence = margin > 0.15 ? 'high' : 'low';

  return { category: bestCategory, confidence };
}

/**
 * Crops a specific tile region from a photo and returns a temp URI for it.
 * cropRect is in photo pixel coordinates.
 */
export async function cropTileRegion(
  photoUri: string,
  cropRect: { originX: number; originY: number; width: number; height: number },
): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    photoUri,
    [{ crop: cropRect }],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

/**
 * Maps a guide rectangle drawn on the camera preview to crop coordinates
 * in the actual photo. Accounts for CameraView's cover-mode scaling.
 *
 * All guide/view values are in logical points; returns pixel coordinates.
 */
export function guideRectToPhotoCrop(
  guide: { x: number; y: number; width: number; height: number },
  view:  { width: number; height: number },
  photo: { width: number; height: number },
): { originX: number; originY: number; width: number; height: number } {
  // CameraView cover mode: scale the photo to fill the view (max of both axes)
  const scaleX = view.width  / photo.width;
  const scaleY = view.height / photo.height;
  const scale  = Math.max(scaleX, scaleY);

  // How much of the photo is hidden behind the view edges
  const displayW = photo.width  * scale;
  const displayH = photo.height * scale;
  const offsetX  = (view.width  - displayW) / 2; // negative = photo overflows view
  const offsetY  = (view.height - displayH) / 2;

  // Convert guide screen coords → photo pixel coords
  const photoX = (guide.x - offsetX) / scale;
  const photoY = (guide.y - offsetY) / scale;
  const photoW = guide.width  / scale;
  const photoH = guide.height / scale;

  return {
    originX: Math.max(0, Math.round(photoX)),
    originY: Math.max(0, Math.round(photoY)),
    width:   Math.min(photo.width  - Math.max(0, Math.round(photoX)), Math.round(photoW)),
    height:  Math.min(photo.height - Math.max(0, Math.round(photoY)), Math.round(photoH)),
  };
}

// ─── Share / Import ───────────────────────────────────────────────────────────

interface TileSetExport {
  version: 1;
  name: string;
  createdAt: string;
  references: Partial<Record<TileCategory, string>>; // base64 JPEG strings
}

export async function exportTileSet(set: TileSet): Promise<string> {
  const refs: Partial<Record<TileCategory, string>> = {};
  for (const [cat, filePath] of Object.entries(set.references) as [TileCategory, string][]) {
    if (!filePath) continue;
    const resized = await ImageManipulator.manipulateAsync(
      filePath,
      [{ resize: { width: 200 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    if (resized.base64) refs[cat as TileCategory] = resized.base64;
  }
  const payload: TileSetExport = { version: 1, name: set.name, createdAt: set.createdAt, references: refs };
  const safeName = set.name.replace(/[^a-z0-9]/gi, '_');
  const tempPath = `${FileSystem.cacheDirectory}${safeName}.mahjongset`;
  await FileSystem.writeAsStringAsync(tempPath, JSON.stringify(payload), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return tempPath;
}

export async function importTileSetFromFile(fileUri: string): Promise<TileSet> {
  const json = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const data = JSON.parse(json) as TileSetExport;
  if (data.version !== 1) throw new Error('Unsupported file version');

  const id = Date.now().toString();
  await ensureDir();
  const savedRefs: Partial<Record<TileCategory, string>> = {};
  for (const [cat, b64] of Object.entries(data.references) as [TileCategory, string][]) {
    if (!b64) continue;
    const dest = `${SETS_DIR}${id}_${cat}.jpg`;
    await FileSystem.writeAsStringAsync(dest, b64, { encoding: FileSystem.EncodingType.Base64 });
    savedRefs[cat] = dest;
  }
  return { id, name: data.name, createdAt: data.createdAt, references: savedRefs };
}

export async function deleteTileSet(id: string): Promise<void> {
  const sets = await loadTileSets();
  await saveTileSets(sets.filter(s => s.id !== id));
  for (const cat of TILE_CATEGORIES.map(c => c.key)) {
    const path = `${SETS_DIR}${id}_${cat}.jpg`;
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true });
  }
}
