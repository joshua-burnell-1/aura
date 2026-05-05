# Aura - Voice-Native Bluetooth Device Assistant

Voice-first assistant for troubleshooting Bluetooth devices, using Anthropic Claude with the `web_search` tool for grounded, citation-backed answers.

## ⚠️ Status: Unfinished

**This project is paused at a hard ceiling: we cannot reliably identify a BLE device's make and model from passive broadcast metadata alone.** The end-to-end UX works (BLE scan → grounded voice answers with citations), but identification is the load-bearing piece, and BLE advertisements simply don't carry enough information for an LLM (or any classifier) to consistently produce the right `make` and `model`.

**If you want to advance this work, please fork the repo.** Promising directions: active GATT discovery (connect to each device and read the standard Device Information Service), a real-world device fingerprint database, or a pivot to user-added device fleets. The bones of the app — Cloudflare Worker proxy, voice loop, BLE scan + categorization scaffolding — are in good shape and reusable.

## Quick Start

### 1. Install Dependencies

```bash
# Install frontend dependencies
npm install

# Install worker dependencies
cd worker
npm install
cd ..
```

### 2. Run Locally

**Terminal 1 - Worker (Backend)**:
```bash
cd worker
npm run dev
```

Worker will run at `http://localhost:8787`

**Terminal 2 - App (Frontend)**:
```bash
# Update .env to point to local worker
echo "EXPO_PUBLIC_PROXY_BASE_URL=http://localhost:8787" > .env

# Start Expo dev server
npx expo start --dev-client
```

### 3. Deploy Worker to Cloudflare

```bash
cd worker

# Login to Cloudflare
npx wrangler login

# Set secrets — replace placeholders with your own keys
echo "<YOUR_ANTHROPIC_API_KEY>" | npx wrangler secret put ANTHROPIC_API_KEY
echo "<YOUR_OPENAI_API_KEY>" | npx wrangler secret put OPENAI_API_KEY

# Deploy
npx wrangler deploy
```

Update `.env` with your deployed Worker URL:
```
EXPO_PUBLIC_PROXY_BASE_URL=https://aura-proxy.YOUR-SUBDOMAIN.workers.dev
```

### 4. Run on iPhone

```bash
# Generate iOS project
npx expo prebuild --platform ios

# Build and run on connected iPhone
npx expo run:ios --device
```

**OR** open in Xcode:
```bash
open ios/aura.xcworkspace
```

## Project Structure

```
aura-project/
├── app/                      # Expo Router pages
│   ├── (tabs)/
│   │   ├── radar.tsx        # BLE scanning + identification
│   │   ├── spaces.tsx       # Zone management
│   │   └── steward.tsx      # Voice chat interface
│   └── _layout.tsx
├── src/
│   ├── components/          # UI components
│   ├── lib/                 # Core utilities
│   ├── state/               # Zustand stores
│   └── theme.ts
├── worker/                  # Cloudflare Worker
│   ├── src/
│   │   ├── routes/         # API endpoints
│   │   ├── llm/            # AI integrations (Anthropic + OpenAI Whisper)
│   │   └── index.ts
│   └── wrangler.toml
└── README.md
```

## Features

- **BLE Scanning**: Discover nearby Bluetooth devices (capped at 100 for the demo)
- **Two-phase flow**: Scan first (collect raw devices), then run identification serially against Anthropic
- **Local categorization fallbacks**: Apple Continuity decoder + SIG service-UUID dictionary so devices get a useful label even when the LLM whiffs
- **Grouped device list**: cards grouped by category in the Radar tab
- **Voice Interface**: Press-and-hold to ask troubleshooting questions
- **Citations**: First citation inline + tappable `+N` to expand the rest
- **Zone Management**: Assign devices to physical spaces (Spaces tab)
- **Privacy-First**: No cloud storage, PII scrubbed before transmission, manufacturer-data prefix-only

## Tech Stack

**Frontend**:
- React Native + Expo (SDK 54)
- Zustand (state management, persisted via AsyncStorage)
- react-native-ble-plx (Bluetooth)
- expo-av (audio recording)
- expo-speech (TTS)

**Backend**:
- Cloudflare Workers
- Hono (web framework)
- Anthropic Claude Opus 4.7 with `web_search` tool
- OpenAI Whisper-1 (transcription)

## Troubleshooting

**iPhone not detected**:
- Ensure iPhone is connected via USB
- Unlock iPhone and tap "Trust This Computer"
- Run: `xcrun devicectl list devices`

**Build errors**:
```bash
# Clean and reinstall
rm -rf node_modules ios/Pods
npm install
cd ios && pod install && cd ..
```

**Worker deployment issues**:
```bash
# Check secrets
cd worker
npx wrangler secret list

# Redeploy
npx wrangler deploy
```

## License

MIT
