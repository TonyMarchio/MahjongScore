import { requireNativeModule } from 'expo-modules-core';

const TileVision = requireNativeModule('TileVision');

/**
 * Compute a perceptual fingerprint for the image at the given file URI.
 * Returns a base64 blob. Store this alongside the tile set reference images.
 */
export async function generateFingerprint(imageUri: string): Promise<string> {
  return TileVision.generateFingerprint(imageUri);
}

/**
 * Compute the distance between two fingerprint blobs.
 * Lower distance = more visually similar. Typical range: 0–2.
 */
export async function computeDistance(fp1: string, fp2: string): Promise<number> {
  return TileVision.computeDistance(fp1, fp2);
}
