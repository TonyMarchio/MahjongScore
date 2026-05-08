import { TILE_CLASS_MAP, BONUS_CODES } from '@/constants/tileMap';
import { DetectedTile } from '@/types/tiles';

const API_KEY      = process.env.EXPO_PUBLIC_ROBOFLOW_API_KEY;
const WORKFLOW_URL = process.env.EXPO_PUBLIC_ROBOFLOW_WORKFLOW_URL
  ?? 'https://serverless.roboflow.com/anthonys-workspace-ywqze/workflows/detect-and-classify';

const CONF_THRESH = 0.5;
const IOU_THRESH  = 0.5;

interface RawPrediction {
  class: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

function iou(a: RawPrediction, b: RawPrediction): number {
  const aL = a.x - a.width / 2, aR = a.x + a.width / 2;
  const aT = a.y - a.height / 2, aB = a.y + a.height / 2;
  const bL = b.x - b.width / 2, bR = b.x + b.width / 2;
  const bT = b.y - b.height / 2, bB = b.y + b.height / 2;
  const iW = Math.max(0, Math.min(aR, bR) - Math.max(aL, bL));
  const iH = Math.max(0, Math.min(aB, bB) - Math.max(aT, bT));
  const inter = iW * iH;
  if (inter === 0) return 0;
  return inter / (a.width * a.height + b.width * b.height - inter);
}

function dedup(preds: RawPrediction[]): RawPrediction[] {
  const sorted = [...preds].sort((a, b) => b.confidence - a.confidence);
  const kept: RawPrediction[] = [];
  for (const p of sorted) {
    if (!kept.some(k => iou(p, k) > IOU_THRESH)) kept.push(p);
  }
  return kept;
}

function extractPredictions(data: unknown): RawPrediction[] {
  // Log full response so we can see the workflow output structure
  console.log('[Roboflow] raw response:', JSON.stringify(data, null, 2));

  // Roboflow Workflow responses wrap outputs in an array
  // Try common shapes and fall back gracefully
  const d = data as Record<string, unknown>;

  if (Array.isArray(d.outputs) && d.outputs.length > 0) {
    const first = d.outputs[0] as Record<string, unknown>;
    // shape: { outputs: [{ predictions: { predictions: [...] } }] }
    if (first.predictions && typeof first.predictions === 'object') {
      const inner = first.predictions as Record<string, unknown>;
      if (Array.isArray(inner.predictions)) return inner.predictions as RawPrediction[];
      if (Array.isArray(inner)) return inner as RawPrediction[];
    }
    // shape: { outputs: [{ predictions: [...] }] }
    if (Array.isArray(first.predictions)) return first.predictions as RawPrediction[];
  }

  // Direct inference fallback: { predictions: [...] }
  if (Array.isArray(d.predictions)) return d.predictions as RawPrediction[];

  console.warn('[Roboflow] could not find predictions in response');
  return [];
}

export async function detectTiles(base64Image: string): Promise<DetectedTile[]> {
  if (!API_KEY) throw new Error('MISSING_KEY');

  console.log('[Roboflow] POST', WORKFLOW_URL);

  let response: Response;
  try {
    response = await fetch(WORKFLOW_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: API_KEY,
        inputs: {
          image: { type: 'base64', value: base64Image },
        },
      }),
    });
  } catch (networkErr) {
    console.error('[Roboflow] fetch failed:', networkErr);
    throw networkErr;
  }

  console.log('[Roboflow] status:', response.status);
  if (response.status === 401 || response.status === 403) throw new Error('INVALID_KEY');
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('[Roboflow] error body:', body);
    throw new Error(`API_ERROR_${response.status}`);
  }

  const data = await response.json();
  const preds = extractPredictions(data);

  const filtered = preds.filter(p => p.confidence >= CONF_THRESH);
  const deduped  = dedup(filtered);
  deduped.sort((a, b) => a.x - b.x);

  return deduped.map(p => ({
    classCode: p.class,
    className: TILE_CLASS_MAP[p.class] ?? p.class,
    confidence: p.confidence,
    bbox: { x: p.x, y: p.y, width: p.width, height: p.height },
    isBonus: BONUS_CODES.has(p.class),
  }));
}
