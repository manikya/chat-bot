# CommerceChat Agent (mobile)

Expo + React Native app for merchants to manage human handoff conversations. WhatsApp-style UI; same JWT auth and APIs as the admin dashboard.

## Features (v1)

- Sign in with store owner/admin credentials (`POST /auth/login`)
- Tokens stored in **Expo Secure Store**
- Inbox with **Needs agent** / **All** filters
- Thread view: message bubbles, **Take over** (+ handoff message), **Return to bot**, manual reply (WhatsApp / Messenger / Instagram)

## v2 (planned)

- Push notifications when `notifyAgentInboundMessage` fires — see `src/lib/push.ts`

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

## Monorepo

- Types: `@commercechat/mock-api`
- Metro watches workspace root (`metro.config.js`)

## Deep links (v2)

Scheme: `commercechat://thread/{conversationId}` (configured in `app.json`).
