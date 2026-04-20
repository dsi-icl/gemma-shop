# Realtime Protocol

## Purpose

This document defines the realtime protocol currently implemented by:

- `/bus` transport in `apps/web/src/routes/bus.ts`
- `/yjs/$` co-bus transport in `apps/web/src/routes/yjs.$.ts`

Primary schema source-of-truth is `apps/web/src/lib/types.ts` (`HelloSchema`, `GSMessageSchema`).

## Transport Endpoints

- `/bus` (JSON + binary)
- `/yjs/<docName>` (Yjs binary sync/awareness)

## Client Roles

- `editor`
- `wall`
- `controller`
- `gallery`

## `/bus` Handshake Protocol

All sockets receive `server_hello` first:

- `server_hello` (S->C): `{ type:'server_hello', commit, builtAt }`

All authenticated clients then use the hello flow:

1. client sends `hello`
2. server sends `hello_challenge` (non-editor roles)
3. client sends `hello_auth` proof
4. server sends `hello_authenticated` or closes / `auth_denied`

### `hello` payloads

- editor: `{ type:'hello', specimen:'editor' }`
- wall: `{ type:'hello', specimen:'wall', wallId, col, row, devicePublicKey? }`
- controller: `{ type:'hello', specimen:'controller', wallId, devicePublicKey? }`
- gallery: `{ type:'hello', specimen:'gallery', wallId?, devicePublicKey? }`

### Auth payloads

- `hello_challenge` (S->C): `{ type:'hello_challenge', nonce }`
- `hello_auth` (C->S):
    - `proof.signature?` (device challenge signature)
    - `proof.portalToken?` (controller-only fallback)
    - at least one proof field is required
- `hello_authenticated` (S->C)
- `auth_denied` (S->C): `{ type:'auth_denied', reason?: 'missing_session' }`
- `device_enrollment` (S->C): `{ type:'device_enrollment', id }` (for pending devices)

### Post-handshake scope join

Editors join content scope after auth using:

- `switch_scope` (C->S): `{ projectId, commitId, slideId }`

Editors may also leave scope explicitly:

- `leave_scope` (C->S)

## Core JSON Message Families (`/bus`)

### Scope hydration and layer lifecycle

- `rehydrate_please` (C->S)
- `hydrate` (S->C)
- `upsert_layer` (bi-directional via server routing)
- `delete_layer` (bi-directional via server routing)
- `seed_scope` (editor -> server)
- `clear_stage` (editor -> server)

### Wall binding and control

- `bind_wall` (controller/gallery/admin paths)
- `request_bind_wall` (editor takeover-aware flow)
- `unbind_wall`
- `wall_binding_status` (editor/controller-facing)
- `wall_node_count` (editor-facing)
- `wall_binding_changed` (gallery-facing)
- `wall_unbound` (gallery-facing)

### Gallery protocol

Gallery clients receive and act on:

- `gallery_state` (snapshot of walls + published projects)
- `wall_binding_changed` (incremental binding update)
- `wall_unbound` (explicit unbind notification)
- `projects_changed` (published project list changed)
- `bind_override_requested` (editor takeover request)
- `bind_override_result` (final override decision/result)

Gallery clients can send:

- `bind_override_decision` (`allow: true|false`)
- `unbind_wall`
- `bind_wall` (gallery-sourced binding)

### Playback

- `video_play`
- `video_pause`
- `video_seek`
- `video_sync`

### Stage persistence

- `stage_dirty`
- `stage_save`
- `stage_save_response`

### Slides and assets

- `update_slides`
- `slides_updated`
- `asset_added`
- `processing_progress`

### System/utility

- `reboot`
- legacy JSON `ping` / `pong` schema entries remain in `GSMessageSchema` (clock sync is binary in runtime)

## Binding Override Flow (Editor vs Gallery)

1. editor sends `request_bind_wall`
2. if no conflict, server binds immediately and returns `bind_override_result(reason:'not_required')`
3. if conflict with active gallery approver, server sends `bind_override_requested` to gallery peers for that wall
4. gallery sends `bind_override_decision`
5. server responds with `bind_override_result` (`approved|denied|timeout|invalid|unknown_wall`)

## Origin Semantics for `upsert_layer`

- `editor:*` -> persistent scope update + scope fanout
- `controller:add_line_layer` -> transient wall-local overlay path (no DB persistence)
- `yjs:sync` -> Yjs bridge text-layer update

## Binary Protocol (`/bus`)

All numeric fields are little-endian.

Opcodes:

- `0x05` `SPATIAL_MOVE`
- `0x08` `CLOCK_PING`
- `0x09` `CLOCK_PONG`
- `0x15` `VIDEO_SYNC`

Reserved for future binary migrations:

- `0x10` `UPSERT_LAYER`
- `0x11` `DELETE_LAYER`
- `0x12` `VIDEO_PLAY`
- `0x13` `VIDEO_PAUSE`
- `0x14` `VIDEO_SEEK`

### `CLOCK_PING` / `CLOCK_PONG`

- `CLOCK_PING` frame: `opcode(u8) + t0(f64)`
- `CLOCK_PONG` frame: `opcode(u8) + t0(f64) + t1(f64) + t2(f64)`
- clients estimate offset/RTT from returned times

### `SPATIAL_MOVE` frame

- header: `opcode(u8) + count(u16)`
- repeated entry (`30` bytes each):
    - `numericId(u16)`
    - `cx(f32)`
    - `cy(f32)`
    - `width(f32)`
    - `height(f32)`
    - `scaleX(f32)`
    - `scaleY(f32)`
    - `rotation(f32)`

### `VIDEO_SYNC` frame

- header: `opcode(u8) + count(u16)`
- repeated entry (`19` bytes each):
    - `numericId(u16)`
    - `status(u8)` (`1=playing`, `0=paused`)
    - `anchorMediaTime(f64)`
    - `anchorServerTime(f64)`

## `/yjs` Co-Bus Protocol

Yjs route is `apps/web/src/routes/yjs.$.ts` and is handled by `YCrossws`.

Underlying protocol message types:

- sync (`messageSync = 0`)
- awareness (`messageAwareness = 1`)

Document identity format:

- `${projectId}_${commitId}_${slideId}_${layerId}`

Lifecycle:

1. peer opens `/yjs/<docName>`
2. sync step1 + awareness fanout
3. dirty docs flush every `SYNC_INTERVAL_MS` (`1000ms`)
4. persisted to `ydocs`
5. converted to HTML and bridged to `/bus` through `process.__YJS_UPSERT_LAYER__`

## Authorization and Rate Limits (Summary)

- message auth is enforced in `isWsMessageAuthorized(...)`
- handshake rate-limited by IP (`hello`, `hello_auth`)
- mutation messages use per-peer rate limiting and strike tracking
- binary `SPATIAL_MOVE` checks sender role/permissions before relay

## Compatibility Guidance

1. Prefer additive schema changes (new optional fields/messages).
2. Keep binary opcode semantics stable once deployed.
3. If behavior changes, update this document and `docs/BUS_PIPING.md` together.
4. Validate protocol changes against `GSMessageSchema` and `HelloSchema` in the same PR.
