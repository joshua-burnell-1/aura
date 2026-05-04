# Aura - Voice-Native Bluetooth Device Assistant

Voice-first assistant for troubleshooting Bluetooth devices using Google Gemini AI with real-time search grounding.

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
npx expo start
```

### 3. Deploy Worker to Cloudflare

```bash
cd worker

# Login to Cloudflare
npx wrangler login

# Set secrets — replace placeholders with your own keys
echo "<YOUR_GEMINI_API_KEY>" | npx wrangler secret put GEMINI_API_KEY
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
│   │   ├── llm/            # AI integrations
│   │   └── index.ts
│   └── wrangler.toml
└── README.md
```

## Features

- **BLE Scanning**: Discover nearby Bluetooth devices
- **AI Identification**: Gemini identifies make/model from metadata
- **Voice Interface**: Press-and-hold to ask questions
- **Streaming Responses**: Real-time TTS during AI response
- **Zone Management**: Assign devices to physical spaces
- **Privacy-First**: No cloud storage, PII scrubbed before transmission

## Tech Stack

**Frontend**:
- React Native + Expo
- Zustand (state management)
- react-native-ble-plx (Bluetooth)
- expo-av (audio recording)
- expo-speech (TTS)

**Backend**:
- Cloudflare Workers
- Hono (web framework)
- Google Gemini 2.5 Flash
- OpenAI Whisper-1

## Deployed Backend

The backend is already deployed at:
```
https://aura-proxy.aura2-proxy.workers.dev
```

Test it:
```bash
curl https://aura-proxy.aura2-proxy.workers.dev/
# Returns: {"status":"ok","service":"aura-proxy"}
```

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
