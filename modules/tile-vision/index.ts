import { requireNativeModule } from 'expo-modules-core';

// Load lazily so a missing native module (old dev build) doesn't crash the app.
// Fingerprinting will be unavailable until the dev client is rebuilt with tile-vision.
let _mod: ReturnType<typeof requireNativeModule> | null = null;
function mod() {
  if (!_mod) {
    try { _mod = requireNativeModule('TileVision'); } catch { /* not in this build */ }
  }
  return _mod;
}

export function isTileVisionAvailable(): boolean {
  return mod() !== null;
}

export async function generateFingerprint(imageUri: string): Promise<string> {
  const m = mod();
  if (!m) throw new Error('TileVision not available — rebuild the dev client');
  return m.generateFingerprint(imageUri);
}

export async function computeDistance(fp1: string, fp2: string): Promise<number> {
  const m = mod();
  if (!m) throw new Error('TileVision not available — rebuild the dev client');
  return m.computeDistance(fp1, fp2);
}
