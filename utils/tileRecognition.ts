// OCR-based tile detection — used for flowers and honor tiles.
// Suit identification is now handled by the fingerprint library in tileSets.ts.

const FLOWER_CHARS = ['梅', '蘭', '菊', '竹', '春', '夏', '秋', '冬'];
const HONOR_CHARS  = ['東', '南', '西', '北', '中', '發', '发'];
const MAN_CHARS    = ['萬', '万'];
const BAM_CHARS    = ['索'];
const PIN_CHARS    = ['筒'];

export interface TileRecognitionResult {
  flowerCount: number;
  hasHonors: boolean;
  isPureOneSuit: boolean;
  isOneSuitWithHonors: boolean;
  suggestedPatternIds: string[];
  rawText: string;
}

export function analyzeTiles(ocrText: string): TileRecognitionResult {
  const flowerCount = FLOWER_CHARS.reduce(
    (n, ch) => n + (ocrText.match(new RegExp(ch, 'g'))?.length ?? 0), 0,
  );

  const hasHonors = HONOR_CHARS.some(ch => ocrText.includes(ch));
  const hasMan    = MAN_CHARS.some(ch => ocrText.includes(ch));
  const hasBam    = BAM_CHARS.some(ch => ocrText.includes(ch));
  const hasPin    = PIN_CHARS.some(ch => ocrText.includes(ch));

  const suitCount           = [hasMan, hasBam, hasPin].filter(Boolean).length;
  const isPureOneSuit       = suitCount === 1 && !hasHonors;
  const isOneSuitWithHonors = suitCount === 1 && hasHonors;

  const suggestedPatternIds: string[] = [];
  if (isPureOneSuit)       suggestedPatternIds.push('qing_yi_se');
  if (isOneSuitWithHonors) suggestedPatternIds.push('cou_yi_se');

  return {
    flowerCount: Math.min(flowerCount, 8),
    hasHonors,
    isPureOneSuit,
    isOneSuitWithHonors,
    suggestedPatternIds,
    rawText: ocrText,
  };
}
