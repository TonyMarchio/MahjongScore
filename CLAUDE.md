# MahjongScore — CLAUDE.md

## What this is
Taiwanese 16-tile mahjong scoring app for iOS. Built with Expo (SDK 54), React Native, Expo Router (file-based routing), TypeScript.

## Architecture
- `app/(tabs)/` — four tabs: Score Hand (index), Scores, Game Setup (explore), Camera
- `utils/scoring.ts` — scoring engine with 40+ Taiwanese mahjong patterns, tai calculation, payments, dealer rotation. DO NOT MODIFY without explicit instruction.
- `utils/types.ts` — all TypeScript interfaces (Player, GameState, ScoredHand, Pattern, etc.). DO NOT MODIFY without explicit instruction.
- `utils/tileSets.ts` — tile set management (photo references, Vision fingerprints, import/export). Legacy system — being supplemented by Roboflow.
- `utils/tileRecognition.ts` — OCR-based tile detection (flowers, honors). Legacy — being supplemented by Roboflow.
- `modules/tile-vision/` — native Swift module wrapping Apple Vision VNFeaturePrintObservation for image fingerprinting. Keep but don't extend.
- `components/` — shared UI components (themed text/view, onboarding overlay, haptic tab)
- `constants/theme.ts` — color scheme and theming

## Design Language
- Primary color: `#8B0000` (dark red) — used for buttons, accents, active states, dealer badges
- Background: `#f5f0e8` (warm cream)
- Cards: `#fff` with `borderColor: '#eee'`, `borderRadius: 10-14`
- Section titles: uppercase, `fontSize: 12-13`, `color: '#888'`, `letterSpacing: 0.8`
- Chinese characters displayed alongside pinyin and English throughout
- Haptic feedback on tab presses

## Key Patterns
- State persistence: AsyncStorage with keys like `mahjong_game_state`, `mahjong_tile_sets`, `mahjong_game_history`, `mahjong_alltime_totals`
- Camera prefill: camera screen writes detection results to AsyncStorage key `camera_prefill`, scoring screen reads and clears it on focus
- Scoring patterns defined in `utils/scoring.ts` PATTERNS array — each has id, chinese, pinyin, english, tai, category. Some are countable (kongs).
- Taiwanese rules: 16-tile hands, self-draw = all 3 pay, discard = only discarder pays
- A winning hand laid out on the table shows **17 regular tiles** (16-tile hand + the winning tile) plus 0–8 bonus tiles (flowers/seasons) set aside separately
- Flower/season tiles are bonus tiles (0-8), set aside from the 16-tile hand; tile-confirm shows "Hand: n/17 tiles" as a guide (not a hard gate)

## Claude Vision Integration (primary)
- `utils/claudeVisionService.ts` — `detectTilesWithVision(base64: string): Promise<DetectedTile[]>`
- Calls `POST https://api.anthropic.com/v1/messages`, model `claude-opus-4-7`, max_tokens 1024
- Sends base64 JPEG + structured prompt asking for JSON array of `{class, confidence, group, position}`
- `group` field: "hand" (main row), "meld" (exposed peng/chow/kong), "bonus" (flower/season)
- Prompt instructs Claude to ignore discard pool, wall tiles, and other players' tiles
- Position strings map to bbox.x for sort order: left=100, center-left=300, center=500, center-right=700, right=900
- Confidence strings map to numbers: high=0.95, medium=0.70, low=0.40
- `isBonus` set when group==="bonus" OR classCode is in BONUS_CODES (belt-and-suspenders)
- bbox.width=0 signals no physical bounding box (tile-confirm skips drawing it)
- Activated when `EXPO_PUBLIC_ANTHROPIC_API_KEY` is set in `.env`

## Roboflow Integration (fallback)
- `services/roboflowService.ts` — `detectTiles(base64: string): Promise<DetectedTile[]>`
- Direct hosted inference: `POST https://serverless.roboflow.com/{ENDPOINT}/{VERSION}?api_key={KEY}`
- Model: mahjong-baq4s/83 — 42 classes, but only detects ~8-10/17 tiles on tile sets it wasn't trained on
- Body: raw base64 JPEG string, `Content-Type: application/x-www-form-urlencoded`
- Response: `{ predictions: [{ class, confidence, x, y, width, height }] }` (center-based coords)
- Environment variables in `.env` (never commit) — must use `EXPO_PUBLIC_` prefix:
  `EXPO_PUBLIC_ROBOFLOW_API_KEY`, `EXPO_PUBLIC_ROBOFLOW_MODEL_ENDPOINT`, `EXPO_PUBLIC_ROBOFLOW_MODEL_VERSION`
- Used when `EXPO_PUBLIC_ANTHROPIC_API_KEY` is absent (controlled by `USE_CLAUDE` const in camera.tsx)
- Flow: camera.tsx → resize to 1920px → base64 → detect → tile-confirm.tsx → CAMERA_PREFILL_KEY → Score Hand

## Dependencies of Note
- expo-camera (CameraView, not legacy Camera)
- @react-native-ml-kit/text-recognition (Chinese script OCR)
- expo-image (not Image from react-native)
- expo-image-manipulator (cropping)
- expo-image-picker (library photo selection — requires dev build)
- @react-native-async-storage/async-storage
- react-native-reanimated, react-native-gesture-handler

## Build Notes
- Uses expo-dev-client (custom dev builds required for native modules)
- EAS Build configured (eas.json present)
- New Architecture enabled (Fabric) — be careful with CameraView child count (must be static to avoid index-mismatch crashes)
- The camera screen renders the set picker dropdown OUTSIDE CameraView to avoid Fabric crashes

## Don'ts
- Don't modify scoring.ts or types.ts without being asked
- Don't remove the tile-vision native module or tile set system — they're fallbacks
- Don't use `Image` from react-native — use `Image` from expo-image
- Don't use conditional children inside CameraView — use empty Views instead of null
- Don't commit .env or API keys
