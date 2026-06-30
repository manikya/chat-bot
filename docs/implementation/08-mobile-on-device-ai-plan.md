# Mobile On-Device AI And Vector Sync Plan

## Goal

Add an optional offline assistant mode to the mobile app using a small on-device Gemma-family model plus a synced tenant knowledge snapshot. The first production target is agent-assist and offline draft replies, not fully autonomous customer replies.

## Principles

- Cloud remains authoritative for inventory, pricing, checkout, billing, channel delivery, tenant config, and analytics.
- Mobile can answer from a signed, tenant-scoped knowledge snapshot when offline or when the query is low risk.
- Local replies must carry confidence and a `needsCloud` flag so the UI can verify or route to the API.
- Native model/runtime work starts only after sync contracts, evals, and fallback routing are stable.

## Architecture

```text
Cloud ingest
  catalog / FAQ / page voice
  embeddings
  mobile snapshot builder
  signed manifest and delta chunks

Mobile app
  snapshot sync client
  encrypted local knowledge store
  local vector search
  local Gemma reply engine
  cloud fallback router
```

## Phase 1: Contracts And Read-Only Sync

- Define mobile snapshot API types.
- Add `GET /api/v1/mobile-ai/snapshot/manifest`.
- Add `GET /api/v1/mobile-ai/snapshot/chunks?sinceVersion=...`.
- Export only tenant-scoped, non-sensitive knowledge.
- Include snapshot expiry, checksum, embedding model, embedding dimensions, and generated timestamp.
- Keep prices and stock marked as volatile; local replies should verify them online before customer delivery.

## Phase 2: Mobile Local Store

- Add encrypted local storage for snapshot rows.
- Store chunk id, source id, text, metadata, embedding, version, and deletion marker.
- Build a simple top-k cosine search path first.
- Add snapshot status UI for internal/debug builds.
- Add background sync after login and app foreground.

## Phase 3: Local RAG Without Local LLM

- Use local retrieval to power offline search cards and FAQ snippets.
- Route risky actions to cloud:
  - checkout/cart
  - order/account questions
  - exact stock/price promises
  - complaints/refunds/escalations
  - low-confidence retrieval
- Add eval cases for offline retrieval recall and stale-data behavior.

## Phase 4: On-Device Gemma Draft Replies

- Android first using a native runtime such as LiteRT or another supported local inference path.
- Package or download a small quantized model by device capability.
- Generate short draft replies from retrieved context.
- Require structured output:
  - `reply`
  - `confidence`
  - `needsCloud`
  - `usedChunkIds`
  - `riskFlags`
- Keep cloud model as fallback for quality, policy, and unsupported devices.

## Phase 5: Production Controls

- Remote kill switch by tenant/app version.
- Device capability gate by RAM, platform, and battery state.
- Snapshot revocation and expiry.
- Analytics for local-answer rate, cloud-fallback rate, latency, crash rate, and stale snapshot usage.
- A/B test against cloud-only replies.

## Pros

- Offline or poor-network support.
- Lower cloud LLM cost for simple replies.
- Faster local FAQ/product suggestions.
- Better privacy for agent draft generation.
- Resilience during API or network incidents.

## Cons

- Larger app and model downloads.
- Native complexity, especially outside Expo Go.
- Lower reply quality than cloud models.
- Battery, memory, and thermal impact.
- Local snapshot can become stale.
- Local data increases device security risk even with encryption.
- More eval and observability work.

## MVP Definition

The first useful MVP is not local generation. It is a synced mobile knowledge snapshot with local retrieval and deterministic offline answers for FAQ/product lookup. After that works reliably, add Gemma-generated draft replies behind a feature flag.

## Open Questions

- Which platforms are required for v1: Android only or Android plus iOS?
- Is the first experience merchant agent-assist, customer widget fallback, or both?
- What maximum model download size is acceptable?
- Should snapshots include embeddings generated in the cloud, or should mobile re-embed with an on-device embedding model?
- What is the allowed staleness window for product prices and stock?
