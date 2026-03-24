# Architecture Overview

## Purpose

This document gives a high-level map of Gemma Shop runtime structure, ownership boundaries, and where to start for deep dives.

Detailed flow-level analysis lives in [PIPING.md](./PIPING.md).

## System At A Glance

Gemma Shop is a collaborative slide system with four realtime client roles:

- `editor`: authoring and stage editing
- `wall`: render node endpoint
- `controller`: wall control and slide navigation
- `roy`: specialist/graph client

Core behavior:

- live multi-client editing over WebSocket bus
- scope-based state model (`projectId + commitId + slideId`)
- commit-backed persistence with mutable head + snapshots
- asset upload and live asset events
- YJS co-bus for collaborative text layer editing

## Main Runtime Components

## 1) Realtime Bus

- WS route: `apps/web/src/addons/routes/bus.ts`
- State/runtime store: `apps/web/src/lib/busState.ts`

Responsibilities:

- peer registration and routing
- bind/unbind walls to scopes
- hydrate fanout to walls/editors/controllers
- playback sync (binary and JSON)
- autosave, stale-peer reaping, wall unbind grace

## 2) YJS Co-Bus (Text Collaboration)

- WS route: `apps/web/src/addons/routes/yjs/[...].ts`

Responsibilities:

- collaborative CRDT updates for text layers
- awareness sync
- ydoc persistence in Mongo
- bridge updates back into main bus via `__YJS_UPSERT_LAYER__`

## 3) Editor Domain

- client engine: `apps/web/src/lib/editorEngine.ts`
- state store: `apps/web/src/lib/editorStore.ts`

Responsibilities:

- sends editing commands (`upsert_layer`, `delete_layer`, `seed_scope`, `update_slides`)
- tracks local selection/tooling state
- reacts to hydrate/fanout updates

## 4) Wall + Controller Domains

- wall engine: `apps/web/src/lib/wallEngine.ts`
- controller engine: `apps/web/src/lib/controllerEngine.ts`

Responsibilities:

- wall render + playback state application
- controller-driven bind/navigation and playback controls
- controller transient overlays

## 5) Upload Pipeline

- route: `apps/web/src/routes/api/uploads/$.ts`

Responsibilities:

- tus upload ingestion
- media processing (image variants, video transcode/preview)
- asset metadata persistence
- bridge events into realtime bus (`__BROADCAST_EDITORS__`, `__BROADCAST_ASSET_ADDED__`)

## 6) Persistence Domain

- server modules: `apps/web/src/server/*.ts`
- db package: `packages/db`

Key collections:

- `projects`
- `commits`
- `assets`
- `walls`
- `ydocs`

## Scope Model (Short)

- Canonical scope label: `e:${projectId}:${commitId}:${slideId}`
- Runtime scope key: numeric `ScopeId` via interning
- Wall binding: `wallId -> scopeId`
- Commit fanout index: `commitId -> set(scopeId)`
- YJS doc key: `${projectId}_${commitId}_${slideId}_${layerId}`

See [PIPING.md](./PIPING.md) for detailed lifecycle semantics.

## Runtime Boundaries

- In-memory bus state is process-local.
- Server function paths and WS routes may diverge in multi-worker deployments unless routing/runtime is constrained.

## Where To Start

1. Read [PIPING.md](./PIPING.md) for transport/state details.
2. Trace client intents from `editorStore.ts` or `controller/index.tsx` into `bus.ts` handlers.
3. Validate persistence implications in `server/walls.ts`, `server/admin.ts`, and `server/projects.ts`.
4. For text sync issues, inspect YJS route flush + bridge flow first.
