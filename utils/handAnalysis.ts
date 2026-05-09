import { HONOR_CODES } from '@/constants/tileMap';

export interface SuggestedPatterns {
  patternIds: string[];
  flowerCount: number;
  noHonors: boolean;
  patternCounts: Record<string, number>;
  confidence: 'high' | 'medium';
}

const WIND_CODES   = new Set(['EW', 'SW', 'WW', 'NW']);
const DRAGON_CODES = new Set(['RD', 'GD', 'WD']);

export function analyzeHand(handTiles: string[], bonusTiles: string[]): SuggestedPatterns {
  const patternIds: string[]                  = [];
  const patternCounts: Record<string, number> = {};
  const flowerCount = bonusTiles.length;
  const noHonors    = !handTiles.some(c => HONOR_CODES.has(c));

  // Tile frequency map
  const counts: Record<string, number> = {};
  for (const code of handTiles) counts[code] = (counts[code] ?? 0) + 1;
  const entries = Object.entries(counts);
  const allVals = Object.values(counts);

  // ── Special flower patterns ───────────────────────────────────────────────
  if (flowerCount === 8)      patternIds.push('ba_duo_hua');
  else if (flowerCount === 7) patternIds.push('qi_qiang_yi');

  // ── Pengs & kongs ─────────────────────────────────────────────────────────
  // Triplet = 3 or 4 of same tile; quad = exactly 4
  const triplets  = entries.filter(([, n]) => n === 3 || n === 4);
  const quads     = entries.filter(([, n]) => n === 4);
  const pengCount = triplets.length;

  // All quads treated as concealed kongs (can't distinguish from photo)
  if (quads.length > 0) patternCounts['an_gang'] = quads.length;

  // Concealed peng milestones — only the highest applicable
  if      (pengCount >= 5) patternIds.push('wu_an_kan');
  else if (pengCount >= 4) patternIds.push('si_an_kan');
  else if (pengCount >= 3) patternIds.push('san_an_kan');
  else if (pengCount >= 2) patternIds.push('liang_an_kan');

  // ── Suit analysis ─────────────────────────────────────────────────────────
  const suitTiles  = handTiles.filter(c => c.length === 2 && 'BCD'.includes(c[1]));
  const honorTiles = handTiles.filter(c => HONOR_CODES.has(c));
  const suits      = new Set(suitTiles.map(c => c[1]));

  if (suits.size === 1 && honorTiles.length === 0 && suitTiles.length === handTiles.length) {
    patternIds.push('qing_yi_se');
  } else if (suits.size === 1 && honorTiles.length > 0) {
    patternIds.push('cou_yi_se');
  }

  // ── All pengs (dui_dui_hu) ────────────────────────────────────────────────
  // Heuristic: no singletons, all counts are 2/3/4, at least 4 triplet/quad varieties
  const hasSingletons = allVals.some(n => n === 1);
  if (!hasSingletons && allVals.every(n => n === 2 || n === 3 || n === 4) && pengCount >= 4) {
    patternIds.push('dui_dui_hu');
  }

  // ── Wind patterns (mutually exclusive, highest wins) ──────────────────────
  const windTrips     = triplets.filter(([c]) => WIND_CODES.has(c));
  const windTripCodes = new Set(windTrips.map(([c]) => c));

  if (windTrips.length === 4) {
    patternIds.push('da_si_xi');
  } else if (windTrips.length === 3) {
    const missing = ['EW', 'SW', 'WW', 'NW'].find(w => !windTripCodes.has(w));
    if (missing && counts[missing] === 2) patternIds.push('xiao_si_xi');
    else                                   patternIds.push('san_feng_peng');
  }

  // ── Dragon patterns (mutually exclusive, highest wins) ────────────────────
  const dragonTrips     = triplets.filter(([c]) => DRAGON_CODES.has(c));
  const dragonTripCodes = new Set(dragonTrips.map(([c]) => c));

  if (dragonTrips.length === 3) {
    patternIds.push('da_san_yuan');
  } else if (dragonTrips.length === 2) {
    const missing = ['RD', 'GD', 'WD'].find(d => !dragonTripCodes.has(d));
    if (missing && counts[missing] === 2) patternIds.push('xiao_san_yuan');
  }

  // ── All honor pengs ───────────────────────────────────────────────────────
  if (handTiles.length > 0 && handTiles.every(c => HONOR_CODES.has(c)) && pengCount >= 4) {
    patternIds.push('quan_zi_peng');
  }

  return { patternIds, flowerCount, noHonors, patternCounts, confidence: 'high' };
}
