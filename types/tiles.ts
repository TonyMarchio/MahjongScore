export interface DetectedTile {
  classCode: string;
  className: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number }; // center-based, original photo pixels
  isBonus: boolean;
}

export interface PendingDetection {
  photoUri: string;
  photoWidth: number;
  photoHeight: number;
  tiles: DetectedTile[];
}
