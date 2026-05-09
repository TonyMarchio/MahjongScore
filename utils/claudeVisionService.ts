import { BONUS_CODES, TILE_CLASS_MAP } from '@/constants/tileMap';
import { DetectedTile } from '@/types/tiles';

const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
const MODEL   = 'claude-sonnet-4-6';

const POSITION_X: Record<string, number> = {
  'left':         100,
  'center-left':  300,
  'center':       500,
  'center-right': 700,
  'right':        900,
};

const CONFIDENCE_VAL: Record<string, number> = {
  high:   0.95,
  medium: 0.70,
  low:    0.40,
};

const PROMPT = `You are analyzing a photo of a Taiwanese mahjong winning hand laid out \
on a table. The photo is taken from one player's perspective.

LAYOUT UNDERSTANDING:
- The WINNING HAND is the row of tiles closest to the camera (bottom \
of the frame), typically 13-17 tiles in a line
- EXPOSED MELDS (pengs, chows, kongs) are groups of 3-4 tiles placed \
above or to the side of the main hand row — these ARE part of the \
winning hand, include them
- BONUS TILES (flowers and seasons) may be placed above or beside the \
hand — include these and mark them as bonus
- IGNORE everything else: the discard pool in the center of the table, \
other players' tiles across the table, wall tiles, loose tiles not \
arranged with the hand

IDENTIFICATION:
For each tile that is part of the winning hand (main row + exposed \
melds + bonus tiles), provide:
- The tile class code using this exact notation:
  Bamboo: 1B, 2B, 3B, 4B, 5B, 6B, 7B, 8B, 9B
  Characters: 1C, 2C, 3C, 4C, 5C, 6C, 7C, 8C, 9C
  Dots: 1D, 2D, 3D, 4D, 5D, 6D, 7D, 8D, 9D
  Winds: EW (East), SW (South), WW (West), NW (North)
  Dragons: RD (Red/中), GD (Green/發), WD (White/白)
  Flowers: 1F (Plum), 2F (Orchid), 3F (Chrysanthemum), 4F (Bamboo)
  Seasons: 1S (Spring), 2S (Summer), 3S (Autumn), 4S (Winter)
- Your confidence: high, medium, or low
- Which group: "hand" (main row), "meld" (exposed peng/chow/kong), \
or "bonus" (flower/season)
- Approximate position within its group: left, center-left, center, \
center-right, or right

Respond ONLY with a JSON array, no other text. Example:
[
  {"class": "1B", "confidence": "high", "group": "hand", "position": "left"},
  {"class": "RD", "confidence": "high", "group": "meld", "position": "right"},
  {"class": "3F", "confidence": "medium", "group": "bonus", "position": "left"}
]

Important: A complete Taiwanese winning hand has 17 tiles total \
(main hand row + exposed melds combined) plus 0-8 bonus tiles \
(flowers/seasons). Count what you identify and make sure you have \
all tiles that belong to this player's winning hand. If a tile is \
partially obscured or uncertain, include it with "low" confidence. \
Do NOT include tiles from the discard pool, wall, or other players.`;

interface VisionTile {
  class:      string;
  confidence: string;
  group:      string;
  position:   string;
}

export async function detectTilesWithVision(imageBase64: string): Promise<DetectedTile[]> {
  if (!API_KEY) throw new Error('MISSING_ANTHROPIC_KEY');

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key':         API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 1024,
        messages: [{
          role:    'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
            { type: 'text',  text: PROMPT },
          ],
        }],
      }),
    });
  } catch (networkErr: unknown) {
    clearTimeout(timeoutId);
    const isAbort = networkErr instanceof Error && networkErr.name === 'AbortError';
    throw new Error(isAbort ? 'TIMEOUT' : (networkErr instanceof Error ? networkErr.message : 'NETWORK'));
  }
  clearTimeout(timeoutId);

  if (response.status === 401 || response.status === 403) throw new Error('INVALID_ANTHROPIC_KEY');
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('[ClaudeVision] error body:', body);
    throw new Error(`CLAUDE_API_ERROR_${response.status}`);
  }

  const data = await response.json();
  const rawText: string = data.content?.[0]?.text ?? '';
  console.log('[ClaudeVision] raw response:', rawText);

  // Extract the JSON array from wherever it appears in the response
  const arrayMatch = rawText.match(/\[[\s\S]*\]/);
  const jsonText   = arrayMatch
    ? arrayMatch[0]
    : rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  let parsed: VisionTile[] = [];
  try {
    const result = JSON.parse(jsonText);
    parsed = Array.isArray(result) ? result : [];
  } catch (parseErr: unknown) {
    console.error('[ClaudeVision] JSON parse failed:', jsonText, parseErr);
  }

  console.log(`[ClaudeVision] parsed ${parsed.length} tiles`);
  parsed.forEach(t => console.log(`  ${t.class} [${t.group}] ${t.position} ${t.confidence}`));

  return parsed
    .filter(t => t.class && TILE_CLASS_MAP[t.class])
    .map(t => ({
      classCode:  t.class,
      className:  TILE_CLASS_MAP[t.class],
      confidence: CONFIDENCE_VAL[t.confidence] ?? 0.70,
      bbox: {
        x:      POSITION_X[t.position] ?? 500,
        y:      0,
        width:  0,
        height: 0,
      },
      isBonus: t.group === 'bonus' || BONUS_CODES.has(t.class),
    }))
    .sort((a, b) => a.bbox.x - b.bbox.x);
}
