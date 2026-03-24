# Bus / Scope Topology (Current State)

## 1) Purpose of this document

This document maps the live logical flow across:

- `apps/web/src/addons/routes/bus.ts` (WebSocket transport + message routing)
- `apps/web/src/lib/busState.ts` (in-memory runtime state + broadcast indices)
- server bind/unbind entrypoints (`apps/web/src/server/walls.ts`, `apps/web/src/server/admin.ts`, `apps/web/src/server/projects.ts`)

It reflects the current codebase as of this update.

---

## 2) What this bus does (high level)

The bus is the real-time coordination layer between four client types:

- `editor` clients (authoring)
- `wall` clients (display nodes)
- `controller` clients (wall control overlay)
- `roy` clients (special-purpose client)

Responsibilities:

- maintain ephemeral live state for slide layers per scope
- route websocket messages (JSON + binary)
- bind walls to a scope and fanout hydrate/binding status
- maintain low-latency playback sync for video layers
- persist/seed selected state with MongoDB (commit data, wall records)
- manage cleanup (stale peers, unbind grace, scope GC)

Why this exists:

- to decouple transport fanout from database writes
- to avoid per-message DB reads during live editing
- to normalize updates across editors/walls/controllers while keeping wall render latency low

---

## 3) What scopes are

A **scope** is the runtime identity of a single slide revision in edit context:

- tuple: `(projectId, commitId, slideId)`
- label format: `e:${projectId}:${commitId}:${slideId}` via `makeScopeLabel(...)`
- runtime key: interned numeric `ScopeId` via `internScope(...)`

### 3.1 Interned scopes

In this bus, a scope is **interned** so the canonical string key is converted once into a stable, small integer:

- input key: `e:${projectId}:${commitId}:${slideId}`
- interning tables:
    - `scopeKeyToId: Map<string, ScopeId>`
    - `scopeIdToKey: Map<ScopeId, string>`
- allocator: `nextScopeId`

Why this matters:

- hot-path maps/broadcast indexes key off `ScopeId` for lower overhead
- repeated joins/binds for the same `(projectId, commitId, slideId)` resolve to the same numeric ID
- logs/debugging can still resolve back to readable text via `scopeLabel(scopeId)`

Interning is runtime-local:

- it is stable only inside one running process memory space
- after process restart or on another worker, numeric IDs may differ even for the same label
- the semantic identity remains the label tuple, not the integer itself

What a scope represents:

- the live layer map (`ScopeState.layers`) for that project+commit+slide
- per-scope dirty/save lifecycle
- scope-local fanout targets (editors, bound walls, controllers via watchers)

### 3.2 Scope types used in this system

There are several scope-like identities; they are related but not identical:

1. Canonical edit scope label (logical identity)
    - format: `e:${projectId}:${commitId}:${slideId}`
    - used for interning, logging, and human-readable tracing
2. Interned runtime scope (`ScopeId`)
    - numeric key produced by `internScope(...)`
    - used by `scopedState`, `editorsByScope`, `wallPeersByScope`, `scopeWatchers`
3. Commit fanout scope-set (`commitToScopeIds`)
    - map from `commitId -> Set<ScopeId>`
    - used for cross-slide commit broadcasts (`update_slides` / `slides_updated`)
4. Wall-bound scope
    - `wallBindings: wallId -> ScopeId`
    - this is how walls/controllers resolve which scope they currently observe
5. YJS document scope key (co-bus text identity)
    - format: `${projectId}_${commitId}_${slideId}_${layerId}`
    - used by `/yjs` route and Mongo `ydocs` persistence, then bridged into bus scope updates

How scopes connect to walls/controllers:

1. a wall is bound to exactly one scope (`wallBindings: wallId -> scopeId`)
2. reverse watchers track scope -> wall IDs (`scopeWatchers`)
3. wall peer fanout is flattened into `wallPeersByScope` for hot-path broadcasts
4. controllers are keyed by wall (`controllersByWallId`) and indirectly track scope via wall binding

---

## 4) Runtime state ownership (`busState.ts`)

Primary HMR-persisted state lives under `(process as any).__BUS_HMR__`:

- `scopedState: Map<ScopeId, ScopeState>`
- `scopeKeyToId`, `scopeIdToKey`, `commitToScopeIds`
- `peers: Map<peerId, PeerEntry>`
- `editorsByScope`, `wallsByWallId`, `controllersByWallId`, `allEditors`
- `wallBindings`, `wallBindingSources`, `scopeWatchers`, `wallPeersByScope`
- `controllerTransientByWallId` (per-wall transient controller layers)
- `activeVideos` (playing video registry)
- `lastPingSeen`, `scopeCleanupTimers`, `wallUnbindTimers`, `peerCounts`

Telemetry is separate under `(process as any).__BUS_TELEMETRY__`.

---

## 5) Transport ownership (`bus.ts`)

`defineWebSocketHandler` manages:

- `open`: mark websocket binary mode + log
- `message`: parse mixed payload forms, validate, dispatch handlers
- `close`: unregister peer, enforce live-unbind/disconnect cleanup semantics

Message parsing now supports all current forms:

- `ArrayBuffer` -> binary handler
- `Buffer | Uint8Array` -> JSON-or-binary sniff (`{` / `[` first non-whitespace)
- `string` -> JSON path

This replaced older brittle logic that depended only on `Buffer` for JSON handling.

---

## 6) Peer handshake + registration flow

`hello` is Zod-validated via `HelloSchema` and re-registration first unregisters stale state for same peer ID.

### 6.1 Editor hello

- intern + create/get scope
- register editor (`editorsByScope`, `allEditors`)
- if scope empty -> `seedScopeFromDb(scopeId)`
- send editor hydrate payload
- send wall summaries to editor for all known walls:
    - `wall_node_count`
    - `wall_binding_status`

### 6.2 Wall hello

- register wall (`wallsByWallId`)
- resolve bound scope from `wallBindings`
- send wall hydrate (`getWallHydratePayload`) or `EMPTY_HYDRATE`
- broadcast node count + binding status to all editors
- persist wall connected count / lastSeen

### 6.3 Controller hello

- register controller (`controllersByWallId`)
- send binding status + hydrate for wall's current binding

### 6.4 Roy hello

- register only

---

## 7) Binding modes and lifecycle

Binding source is explicitly tracked:

- `'live'`: from websocket `bind_wall` handler (editor-driven)
- `'gallery'`: from server function `bindWallToScope(...)`

`bindWall(...)` updates:

- `wallBindings`, `wallBindingSources`
- `scopeWatchers` reverse index
- `wallPeersByScope` flattened fanout set
- scope cleanup scheduling/cancel behavior

### 7.1 Live bind (`handlers.set('bind_wall')`)

Flow:

1. cancel pending wall unbind grace
2. resolve requested slide against commit
3. get project custom render settings
4. intern/get scope
5. `bindWall(wallId, scopeId, 'live')`
6. seed from DB if empty
7. notify controllers bound=true
8. hydrate wall nodes
9. upsert Mongo wall binding fields (`bound*`, `boundSource='live'`)
10. broadcast binding status + node count to editors

### 7.2 Gallery bind (`server/walls.ts::bindWallToScope`)

Flow:

1. validate commit belongs to project
2. resolve requested slide (fallback first slide)
3. get project custom render settings
4. intern/get scope
5. `bindWall(wallId, scopeId, 'gallery')`
6. seed from DB if empty
7. hydrate wall nodes
8. notify controllers bound=true
9. persist Mongo wall binding fields (`boundSource='gallery'`)

### 7.3 Unbind behavior

- explicit websocket `unbind_wall` unbinds + hydrates empty + controller notify + DB clear + editor status broadcasts
- editor disconnect auto-unbinds only `live` bindings when last editor leaves that scope
- wall disconnect schedules global unbind grace (5s) when node count reaches zero, regardless of source
- admin unbind calls `unbindWall` + hydrate + controller notify + DB clear

---

## 8) Layer update + fanout behavior

### 8.1 Persistent stage layers

- `upsert_layer` (non-controller-transient) mutates `scopedState.layers`
- video layer playback fields are protected from generic upsert overwrite
- marks `dirty`, invalidates hydrate cache, broadcasts to scope

### 8.2 Controller transient layers

`origin === 'controller:add_line_layer'` routes into `controllerTransientByWallId`:

- no DB persistence
- no editor fanout
- fanout only to wall peers + sibling controllers for same wall
- merged into wall hydrate payload by numericId override

### 8.3 Deletes

- persistent delete clears layer + YDoc + active video entry
- transient delete clears per-wall transient entry
- routes fanout according to transient/persistent path

### 8.4 Seed/clear

- `seed_scope`: replace all scope layers, clear controller transient + active videos, hydrate bound walls, notify editors
- `clear_stage`: clear layers + playback command history + active videos + controller transient, broadcast empty hydrate to scope/controllers

---

## 9) Video sync model

- command handlers: `video_play`, `video_pause`, `video_seek`
- anti-reorder gate: `shouldApplyPlaybackCommand(scopeId, numericId, issuedAt)`
- active playback registry: `activeVideos`
- immediate critical sync: `sendVideoSyncToRelevantWalls(...)`
- periodic VSYNC loop (500ms): batches loop/end transitions and sends binary `VIDEO_SYNC`
- adaptive playback lead (`estimatePlaybackLeadMs`) based on fanout + backpressure

---

## 10) Background processes and bridges

Global process bridges:

- `__BROADCAST_EDITORS__`: raw payload to all editors
- `__BROADCAST_ASSET_ADDED__`: project-targeted asset fanout
- `__YJS_UPSERT_LAYER__`: scoped text layer upsert + broadcast

Intervals:

- VSYNC interval: 500ms
- auto-save dirty scopes: 30s
- stale peer reaper: 10s (`PING_TIMEOUT_MS = 60s`, editors/walls only)

HMR cleanup clears intervals in dispose handlers.

---

## 11) Other noteworthy bus callers (beyond bind/unbind)

These components do not directly import `bus.ts`, but they drive key handlers in `bus.ts` over WS:

- `apps/web/src/lib/editorStore.ts`
    - sends high-volume authoring messages: `upsert_layer`, `delete_layer`, `seed_scope`, `update_slides`, `clear_stage`, `reboot`
- `apps/web/src/routes/controller/index.tsx`
    - sends controller actions: `video_play`, `video_pause`, `video_seek`, and controller-transient `upsert_layer` (`origin: 'controller:add_line_layer'`)
- `apps/web/src/routes/wall/index.tsx` and `apps/web/src/routes/controller/index.tsx`
    - request resync via `rehydrate_please`
- `apps/web/src/lib/editorEngine.ts`, `apps/web/src/lib/wallEngine.ts`, `apps/web/src/lib/controllerEngine.ts`
    - own hello/join and binary ping/move client behavior that feeds `handleHello`, binary clock sync, and binary spatial relay paths

Other noteworthy non-WS routes that plug into bus behavior through process bridges:

- `apps/web/src/routes/api/uploads/$.ts`
    - uses `process.__BROADCAST_EDITORS__` to emit `processing_progress` during ffmpeg transcoding
    - uses `process.__BROADCAST_ASSET_ADDED__` after asset DB insert so editors in matching project receive `asset_added`

---

## 12) YJS co-bus (`apps/web/src/addons/routes/yjs/[...].ts`)

This route is a separate websocket subsystem dedicated to collaborative text editing state (Yjs + Lexical), running alongside the main `/bus` route.

What it does:

- hosts per-text-layer Yjs docs over WS
- syncs awareness and CRDT updates between connected peers
- persists Yjs binary state into Mongo `ydocs` (`scope` unique index)
- periodically flushes doc state, converts Yjs -> HTML, and forwards text updates into the main bus

How it identifies docs:

- doc path maps to `docName`
- expected format: `${projectId}_${commitId}_${slideId}_${layerId}`
- this aligns with bus-side YDoc scope naming used by `deleteYDocForLayer(...)`

How it plugs into `bus.ts` / `busState.ts`:

1. YJS route keeps its own in-memory `SharedDoc` registry (`docs`, `peerIds`, awareness, dirty flags)
2. every dirty doc is flushed on a 1s loop (`SYNC_INTERVAL_MS`)
3. flush persists Yjs binary update to Mongo
4. flush converts the Yjs doc to HTML via headless Lexical
5. dedupes unchanged content via SHA1 hash
6. calls bridge `(process as any).__YJS_UPSERT_LAYER__?.(payload)`
7. bridge is defined in `apps/web/src/addons/routes/bus.ts`, where it:
    - interns/creates scope
    - updates `scope.layers` text layer (`origin: 'yjs:sync'`)
    - marks scope dirty, invalidates hydrate cache
    - broadcasts `upsert_layer` to relevant editors/walls through bus fanout

Lifecycle highlights:

- on first doc creation, YJS route loads fallback text layer from commit if no persisted ydoc exists
- on peer close, if no peers remain for the doc, it flushes, persists, and destroys the doc
- this gives YJS its own collaboration transport while still converging into the bus's canonical live scope state

### 12.1 Sequence diagram (YJS -> Bus)

```text
YJS Client
  -> /yjs WS ([...].ts): sync/awareness updates
  -> SharedDoc (dirty=true)
  -> flush loop (1s): write ydoc binary to Mongo `ydocs`
  -> flush loop: convert Yjs state to HTML (Lexical headless)
  -> flush loop: call process.__YJS_UPSERT_LAYER__(payload)

Bridge in /bus (bus.ts)
  -> internScope(projectId, commitId, slideId)
  -> getOrCreateScope(scopeId, ...)
  -> upsert text layer in scope.layers (origin: yjs:sync)
  -> invalidateHydrateCache(scopeId), scope.dirty=true
  -> broadcastToScope(upsert_layer)

Recipients
  -> editors in that scope receive JSON upsert_layer
  -> walls bound to that scope receive JSON upsert_layer
  -> subsequent hydrate requests include updated text content
```

---

## 13) File ownership map for non-WS paths

Direct `~/lib/busState` imports:

1. `apps/web/src/addons/routes/bus.ts`
2. `apps/web/src/server/walls.ts`
3. `apps/web/src/server/admin.ts`
4. `apps/web/src/server/projects.ts`

Server-side usage highlights:

- `walls.ts`: bind wall + hydration + controller notify + node-count fallback for listing
- `admin.ts`: telemetry, peer counts, unbind wall
- `projects.ts`: reads `scopedState` for unsaved layers and pushes custom render settings via `updateProjectCustomRenderSettings(...)`

---

## 14) Fragility / contention hotspots and refactor candidates

## 14.1 Multi-runtime state isolation risk (highest)

`busState` is in-memory and process-local. If websocket traffic and server functions execute in different workers/processes, maps diverge (e.g. one process sees `wallsByWallId` empty while another has live peers).

Refactor direction:

- centralize real-time bus into a single runtime boundary, or
- externalize live indices to shared infra (Redis/NATS/etc.), or
- enforce sticky routing so related control-plane calls hit same worker

## 14.2 Duplicated bind/unbind orchestration

Similar binding logic exists in websocket handlers and server functions, including DB writes and notify/hydrate order.

Refactor direction:

- create one shared orchestrator service (`bindWallFlow`, `unbindWallFlow`) with source-specific policy flags

## 14.3 Authorization gap on websocket bind/unbind

`bind_wall` / `unbind_wall` handlers do not currently check sender specimen/permissions in the handler itself.

Refactor direction:

- enforce role check (`editor` only) + wall/project authorization before state mutation

## 14.4 `activeVideos` keying collision risk

`activeVideos` is keyed only by `numericId` (global map). If different scopes reuse the same numeric layer IDs, entries can overwrite each other.

Refactor direction:

- key by composite (`scopeId:numericId`) or nested map (`Map<scopeId, Map<numericId,...>>`)

## 14.5 Asymmetric admin unbind fanout

`adminUnbindWall` does not broadcast editor-facing `wall_binding_status` / `wall_node_count`, unlike websocket unbind paths.

Refactor direction:

- reuse unified unbind orchestrator and fanout policy to keep editor UI consistent

## 14.6 Fanout cost on editor hello

Each editor hello loops all known walls and sends two messages per wall. This becomes expensive with many walls/editors.

Refactor direction:

- snapshot wall summaries once and send a single aggregate payload
- or paginate/subset by tenant/project relevance

## 14.7 Repeated JSON dispatch code paths

`Buffer/Uint8Array` and `string` branches duplicate parse/dispatch logic.

Refactor direction:

- normalize to one `rawText -> parse -> dispatch` path to reduce drift risk

## 14.8 Transient-vs-persistent numericId overwrite semantics

`getWallHydratePayload` merges persistent and transient layers by `numericId`, where transient wins. This is intentional but can hide collisions.

Refactor direction:

- namespace transient IDs or add explicit collision guard/logging

## 14.9 Write ordering and partial-failure windows

Many flows send realtime notifications before/around async DB updates. Temporary divergence can occur if DB write fails after fanout.

Refactor direction:

- codify consistency model (realtime-first vs DB-first)
- add compensating retries/alerts for failed DB persistence

---

## 15) Scope format summary

- canonical runtime scope label: `e:${projectId}:${commitId}:${slideId}`
- interned numeric scope ID: `ScopeId`
- YDoc key format for text-layer persistence cleanup: `${projectId}_${commitId}_${slideId}_${numericId}`

---

## 16) Quick mental model

- scopes are the bus's unit of content identity
- walls bind to scopes
- controllers bind to walls (and inherit scope via wall binding)
- editors speak directly in scope terms
- bus state is optimized for low-latency fanout, with DB used for seed/save/persistence boundaries

---

## 17) Naming Semantics and Refactor Structure Proposal

This section proposes a naming and module-structure cleanup to improve readability, reduce ambiguity, and make behavior easier to reason about during incidents/refactors.

### 17.1 Naming conventions (proposed)

Use domain + action + target consistently:

- `emit*` for websocket/network fanout
- `persist*` for database writes
- `apply*` for in-memory state mutation
- `ensure*` for create-if-missing semantics
- `resolve*` for lookup/derivation
- `schedule*` / `cancel*` for timer lifecycle

Map naming:

- `XByY` for indexed maps
- `allX` for flat sets
- `XForY` for computed/resolved values

Avoid overloaded words:

- use `peer` for websocket recipients
- reserve `node` for physical wall tiles/topology concerns

### 17.2 High-value rename map

Bus state/runtime naming:

- `internScope` -> `ensureScopeId`
- `getOrCreateScope` -> `ensureScopeState`
- `resolveScopeId` -> `resolveScopeIdForPeerMeta`
- `scopeWatchers` -> `wallIdsByScopeId`
- `wallPeersByScope` -> `wallPeersByScopeId`

Fanout/hydration naming:

- `broadcastToWallNodesRaw` -> `emitToWallPeersByWallIdRaw`
- `hydrateWallNodes` -> `emitWallHydrateByWallId`
- `notifyControllers` -> `emitWallBindingStatusToControllers`
- `sendVideoSyncToRelevantWalls` -> `emitVideoSyncToScopeWalls`
- `broadcastVideoSyncBatchToWalls` -> `emitVideoSyncBatchToScopeWalls`

Route-local helper naming (`bus.ts`):

- `syncWallNodeCountToDb` -> `persistWallPresenceAndBindingSnapshot`
- `broadcastWallNodeCountToEditors` -> `emitWallNodeCountToEditors`
- `broadcastWallBindingToEditors` -> `emitWallBindingStatusToEditors`
- `handleHello` -> `handleHelloHandshake`
- `handleBinary` -> `handleBinaryFrame`

YJS co-bus naming:

- `onDocUpdate` -> `relayDocUpdateToPeers`
- `flushDoc` -> `persistAndBridgeDirtyDoc`
- `getDoc` -> `resolveOrCreateDocForPeer`

### 17.3 Split/merge opportunities (technical debt reduction)

1. Split `bus.ts` by concern:
    - `messageDecode.ts` (parse/dispatch)
    - `helloHandlers.ts`
    - `layerHandlers.ts`
    - `bindingHandlers.ts`
    - `playbackHandlers.ts`

2. Merge duplicated bind/unbind orchestration across WS + server functions:
    - introduce shared flows: `bindWallFlow(...)`, `unbindWallFlow(...)`
    - reuse in:
        - ws `bind_wall` / `unbind_wall`
        - `server/walls.ts::bindWallToScope`
        - `server/admin.ts::adminUnbindWall`

3. Split YJS `YCrossws` into:
    - `DocRepository` (load/persist/index)
    - `YjsTransport` (open/message/close + awareness)
    - `BusBridge` (Yjs -> HTML -> `__YJS_UPSERT_LAYER__`)

4. Merge duplicated editor-hello wall summary emission into one helper:
    - e.g. `emitWallSummariesToEditor(peer)`

5. Remove or formalize no-op exported APIs:
    - `invalidateWallHydrateCache` currently no-op

### 17.4 Rollout strategy

To reduce migration risk:

1. Alias phase:
    - add new function names as wrappers around existing implementations
    - keep old names as deprecated passthroughs
2. Adoption phase:
    - migrate callsites module-by-module
3. Cleanup phase:
    - remove deprecated names after one stabilization cycle

This allows behavior-preserving refactors while improving semantic clarity incrementally.
