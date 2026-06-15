# CommerceChat Agent (mobile)

Expo + React Native app for merchants to manage human handoff conversations. WhatsApp-style UI; same JWT auth and APIs as the admin dashboard.

## Features (v1)

- Sign in with store owner/admin credentials (`POST /auth/login`)
- Tokens stored in **Expo Secure Store**
- Inbox with **Needs agent** / **All** filters
- Thread view: message bubbles, **Take over** (+ handoff message), **Return to bot**, manual reply (WhatsApp / Messenger / Instagram)
- **Push notifications** when a customer messages during human handoff (physical device; requires notification permission)

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
| POST | `/api/v1/devices/register` |
| DELETE | `/api/v1/devices/register` |

## Monorepo

- Types: `@commercechat/mock-api`
- Metro watches workspace root (`metro.config.js`)

## Deep links

Scheme: `commercechat://thread/{conversationId}` (configured in `app.json`). Used by push notification taps.
