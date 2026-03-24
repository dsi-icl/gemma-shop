# Realtime Protocol

## Purpose

This document defines the realtime protocol shape and message semantics used by:

- main bus: `apps/web/src/addons/routes/bus.ts`
- YJS co-bus: `apps/web/src/addons/routes/yjs/[...].ts`

Schemas are primarily defined in `apps/web/src/lib/types.ts` (`HelloSchema`, `GSMessageSchema`).

## Transport Endpoints

- `/bus` (JSON + binary)
- `/yjs/<docName>` (Yjs sync/awareness binary protocol)

## Client Roles

- `editor`
- `wall`
- `controller`
- `roy`

All `/bus` sessions begin with `type: 'hello'` and role-specific payload.

## Handshake Messages

`hello` variants:

- wall: `{ type:'hello', specimen:'wall', wallId, col, row }`
- controller: `{ type:'hello', specimen:'controller', wallId }`
- editor: `{ type:'hello', specimen:'editor', projectId, commitId, slideId }`
- roy: `{ type:'hello', specimen:'roy' }`

Semantics:

- server validates hello via `HelloSchema`
- server registers peer and sends initial hydrate/binding context as applicable

## Core JSON Message Families (`/bus`)

## Hydration and binding

- `rehydrate_please`
- `hydrate`
- `bind_wall`
- `unbind_wall`
- `wall_binding_status`
- `wall_node_count`

## Layer and stage operations

- `upsert_layer`
- `delete_layer`
- `seed_scope`
- `clear_stage`
- `reboot`
- `stage_dirty`
- `stage_save`
- `stage_save_response`

## Playback

- `video_play`
- `video_pause`
- `video_seek`
- `video_sync`

## Slide metadata and assets

- `update_slides`
- `slides_updated`
- `asset_added`
- `processing_progress`

## Origin Semantics

`upsert_layer.origin` is used to route behavior:

- editor origins: persisted scope updates + scope fanout
- `controller:add_line_layer`: transient, wall-local/controller-local overlay path
- `yjs:sync`: bus bridge text updates from YJS co-bus

## Binary Protocol (`/bus`)

Opcodes:

- `0x05` `SPATIAL_MOVE`
- `0x08` `CLOCK_PING`
- `0x09` `CLOCK_PONG`
- `0x15` `VIDEO_SYNC`

Reserved:

- `0x10` `UPSERT_LAYER`
- `0x11` `DELETE_LAYER`
- `0x12` `VIDEO_PLAY`
- `0x13` `VIDEO_PAUSE`
- `0x14` `VIDEO_SEEK`

### Clock sync

- editor/wall send binary ping
- server replies binary pong with timing data
- clients estimate clock offset and RTT

### Spatial move

- sender scope is resolved server-side
- relayed to editors and scoped wall peers

### Video sync frame format

- header: opcode(u8) + count(u16)
- repeated entries: `numericId(u16) + status(u8) + anchorMediaTime(f64) + anchorServerTime(f64)`

## YJS Co-Bus Protocol (`/yjs`)

Underlying messages:

- Yjs sync protocol (`messageSync = 0`)
- Yjs awareness protocol (`messageAwareness = 1`)

Document identity:

- `docName = ${projectId}_${commitId}_${slideId}_${layerId}`

Lifecycle:

1. peer connects and receives sync step
2. awareness updates are relayed to all doc peers
3. dirty docs flush periodically (default 1s)
4. persisted to `ydocs`
5. converted to HTML and bridged into `/bus` via `__YJS_UPSERT_LAYER__`

## Validation and Error Handling

- hello uses strict schema validation
- most JSON messages are checked for `type`, then dispatched
- fallback schema parse is used in some error paths for diagnostics
- unknown/unregistered peer messages are ignored with warning logs

## Compatibility and Evolution Guidance

1. Prefer additive message evolution (new optional fields/types).
2. Keep binary opcode compatibility stable once clients are deployed.
3. Any breaking schema changes should be gated by capability/version markers.
4. Update this document and `PIPING.md` together when protocol semantics change.
