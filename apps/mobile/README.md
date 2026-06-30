# CommerceChat Agent (mobile)

Expo + React Native app for merchants to manage human handoff conversations. WhatsApp-style UI; same JWT auth and APIs as the admin dashboard.

## Features (v1)

- Sign in with store owner/admin credentials (`POST /auth/login`)
- Tokens stored in **Expo Secure Store**
- Inbox with **Needs agent** / **All** filters
- Thread view: message bubbles, **Take over** (+ handoff message), **Return to bot**, manual reply (WhatsApp / Messenger / Instagram)
- **Push notifications** when a customer messages during human handoff (physical device; requires notification permission)

## Offline AI direction

The mobile app now has an initial TypeScript scaffold for offline AI routing in `src/lib/offline-ai.ts` and snapshot sync orchestration in `src/lib/mobile-ai-sync.ts`. The intended rollout is:

1. Sync a tenant-scoped knowledge snapshot from the cloud.
2. Store and search it locally on device.
3. Use local retrieval for offline FAQ/product lookup.
4. Add on-device Gemma draft replies behind a feature flag.
5. Verify live stock, price, checkout, account, and complaint flows in the cloud.

The detailed plan lives in `docs/implementation/08-mobile-on-device-ai-plan.md`.

Local model downloads are user-controlled from Settings -> Offline AI. Configure the model artifact at build time with:

- `EXPO_PUBLIC_LOCAL_LLM_MODEL_URL`
- `EXPO_PUBLIC_LOCAL_LLM_MODEL_SIZE_BYTES`
- `EXPO_PUBLIC_LOCAL_LLM_MODEL_ID`
- `EXPO_PUBLIC_LOCAL_LLM_MODEL_VERSION`
- `EXPO_PUBLIC_LOCAL_LLM_MODEL_NAME`
- `EXPO_PUBLIC_LOCAL_LLM_MODEL_FILE_NAME`
- `EXPO_PUBLIC_LOCAL_LLM_MODEL_MD5`

The app stores the model under its document directory, shows size/progress, supports pause/resume through Expo's resumable download API, and lets the user remove the local file.

## Push notifications

1. On login, the app registers an Expo push token via `POST /api/v1/devices/register`.
2. When `notifyAgentInboundMessage` fires (human mode + debounced), the API sends email **and** Expo push to all registered devices for the tenant.
3. Tapping a notification opens `commercechat://thread/{conversationId}`.

For production builds, set an EAS project id in `app.json` → `extra.eas.projectId` (run `eas init` in `apps/mobile`). Optional: set `EXPO_ACCESS_TOKEN` on the API for higher Expo push rate limits.

## Setup

```bash
cp .env.example .env
# Physical device: use your machine LAN IP or AWS dev API, not localhost
# EXPO_PUBLIC_API_URL=https://fimfx57xwl.execute-api.us-east-1.amazonaws.com

npm run dev:mobile   # from repo root
# or
cd apps/mobile && npm run dev
```

Press `i` (iOS simulator) or `a` (Android emulator). Scan QR with Expo Go on a real device.

## Installable APK (Android, no Expo Go)

Build a standalone `.apk` and sideload it on your phone.

### One-time setup

```bash
npm install -g eas-cli
eas login
cd apps/mobile
eas init
```

### Build APK (cloud)

```bash
cd apps/mobile
npm run build:apk
```

When the build finishes, open the **download URL** on your Android phone and install the APK.

### Send APK to phone

- **Direct:** open EAS build link on the phone
- **USB:** `adb install app.apk`
- **Share:** email/Drive/WhatsApp the `.apk` to yourself

The `preview` profile uses the dev API URL from `eas.json` (`EXPO_PUBLIC_API_URL`).

## API surface (shared with future builds)

| Method | Path |
|--------|------|
| POST | `/auth/login` |
| GET | `/auth/me` |
| POST | `/auth/refresh` |
| GET | `/api/v1/conversations?handlingMode=human` |
| GET | `/api/v1/conversations/{id}` |
| GET | `/api/v1/conversations/{id}/messages` |
| PATCH | `/api/v1/conversations/{id}/handling` |
| POST | `/api/v1/conversations/{id}/reply` |
| GET | `/api/v1/mobile-ai/snapshot/manifest` |
| GET | `/api/v1/mobile-ai/snapshot/chunks` |
| POST | `/api/v1/devices/register` |
| DELETE | `/api/v1/devices/register` |

## Monorepo

- Types: `@commercechat/mock-api`
- Metro watches workspace root (`metro.config.js`)

## Deep links

Scheme: `commercechat://thread/{conversationId}` (configured in `app.json`). Used by push notification taps.
