# MahjongScore

A Taiwanese mahjong scoring app for iOS. Tracks hands, calculates payments, and keeps running totals across sessions — no more mental math or arguments about who owes what.

## Features

- **Score Hand** — pick the winner, draw method, and patterns; payments are calculated automatically using Taiwanese rules
- **Scores** — live table layout showing all four players, hand log, undo last hand
- **Session History & All-Time** — saves completed games and tracks cumulative standings; lowest total buys the next meal
- **Camera Scorer (Beta)** — point the camera at your 16 tiles; OCR detects flowers and honors, fingerprint matching identifies suit tiles
- **Tile Sets** — photograph reference tiles from your own set for better camera recognition; share sets with other players via AirDrop

## Scoring Rules

Implements Stephen's Taiwanese mahjong tai system:

- Self draw → all 3 opponents pay
- Discard win → only the discarder pays
- Dealer bonus (+1 tai) applied automatically; dealer retains deal on a win
- Supports countable patterns (exposed/concealed kongs), limit hands (小胡, 八朵花, 清一色, etc.), and flower/honor bonuses

## Getting Started

Requires a custom dev client (the camera and tile-vision modules are not compatible with Expo Go).

```bash
npm install
npx expo start
```

Build the dev client for your device:

```bash
npx expo run:ios
```

## Stack

- [Expo](https://expo.dev) / React Native (iOS)
- [expo-camera](https://docs.expo.dev/versions/latest/sdk/camera/) for tile capture
- [@react-native-ml-kit/text-recognition](https://github.com/a7ul/react-native-mlkit) for OCR
- Custom `tile-vision` native module (Vision framework fingerprinting via `VNGenerateImageFeaturePrintRequest`)
- AsyncStorage for local persistence
