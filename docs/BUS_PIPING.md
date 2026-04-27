# Bus / Scope Topology (Current State)

## 1) Purpose

This document maps the current runtime flow for the realtime bus and scope system.

Primary files:

- `apps/web/src/routes/bus.ts` (WebSocket transport + dispatch)
- `apps/web/src/lib/busState.ts` (runtime state + fanout indices)
- `apps/web/src/server/bus/bus.handlers.ts` (message handlers)
- `apps/web/src/server/bus/bus.binding.ts` (bind/unbind + gallery state)
- `apps/web/src/server/bus/bus.peers.ts` (registration + scope transitions)
- `apps/web/src/server/bus/bus.authz.ts` (authz + rate limits)

## 2) What the Bus Does

The bus coordinates four realtime peer roles:

- `editor`
- `wall`
- `controller`
- `gallery`

Core responsibilities:

- maintain scope-local live layer state
- route JSON and binary websocket frames
- track wall bindings and binding source (`live` or `gallery`)
- fan out hydrate/binding/playback updates
- bridge Yjs text updates into scope layers
- run cleanup loops (autosave, stale-peer reaping, unbind grace)

## 3) Scope Model

A scope represents one editable slide revision:

- tuple: `(projectId, commitId, slideId)`
- label: `e:${projectId}:${commitId}:${slideId}`
- runtime key: interned numeric `ScopeId`

Related indexes:

- `scopedState: ScopeId -> ScopeState`
- `editorsByScope: ScopeId -> Set<editorPeer>`
- `wallBindings: wallId -> ScopeId`
- `scopeWatchers: ScopeId -> Set<wallId>`
- `wallPeersByScope: ScopeId -> Set<wallPeer>`
- `commitToScopeIds: commitId -> Set<ScopeId>`

Yjs uses a separate doc key:

- `${projectId}_${commitId}_${slideId}_${layerId}`

## 4) Runtime State Ownership (`busState.ts`)

HMR-persisted state includes:

- scope maps (`scopedState`, interning tables)
- peer registry (`peers`, `allEditors`, `allGalleries`, role-specific indexes)
- wall binding maps (`wallBindings`, `wallBindingSources`)
- playback state (`activeVideos`, playback command ordering)
- transient controller overlays (`controllerTransientByWallId`)
- timers (`scopeCleanupTimers`, `wallUnbindTimers`)
- liveness (`lastPingSeen`, peer counts)

## 5) Transport Ownership (`/bus`)

`apps/web/src/routes/bus.ts` wires websocket hooks:

- `open`: set binary mode and emit `server_hello`
- `message`: decode binary/JSON and dispatch
- `close`: unregister peer and run role-specific cleanup

Payload forms accepted:

- `ArrayBuffer` (binary fast path)
- `Buffer | Uint8Array` (JSON-vs-binary sniff)
- `string` (JSON)

## 6) Handshake and Registration

### 6.1 Handshake sequence

1. server emits `server_hello`
2. client sends `hello`
3. non-editor roles receive `hello_challenge`
4. client sends `hello_auth`
5. server sends `hello_authenticated` (or `auth_denied` / closes)

### 6.2 Role registration behavior

- `editor`
    - registered without initial scope during `hello`
    - joins scope via `switch_scope` (with permission checks)
    - receives hydrate + wall summaries (`wall_node_count`, `wall_binding_status`)
- `wall`
    - registered on wallId/position
    - receives hydrate for current binding (or empty)
    - triggers editor/gallery wall summary fanout
- `controller`
    - registered on wallId
    - receives `wall_binding_status`, hydrate, and `slides_updated` snapshot
- `gallery`
    - registered either globally or wall-scoped
    - receives `gallery_state` snapshot
    - participates in bind override approvals

Pending/unapproved devices may receive `device_enrollment` and stay in pending state.

## 7) Authorization and Rate Limits

Authorization is centralized in `isWsMessageAuthorized(...)`:

- editor mutations require cached `canEdit`
- viewer actions require `canView` or device/portal actor depending on role
- `bind_override_decision` requires gallery admin user or enrolled gallery device
- `bind_wall`/`unbind_wall`/`reboot` are role-gated (controller/gallery/admin policy)

Rate limiting:

- handshake messages (`hello`, `hello_auth`) are IP-scoped
- mutation messages are peer-scoped with strike tracking
- binary `SPATIAL_MOVE` has explicit auth checks before relay

## 8) Binding Modes and Lifecycle

Binding source is tracked as:

- `live` (editor/controller initiated flow)
- `gallery` (gallery initiated flow)

### 8.1 Bind flow (`performLiveBind`)

1. cancel wall unbind grace timer
2. validate wall + commit/project + slide
3. resolve/ensure scope and seed from DB if needed
4. `bindWall(wallId, scopeId, source)`
5. notify controllers and hydrate wall peers
6. push controller slide snapshot
7. persist wall binding fields in DB (`bound*`, `boundSource`)
8. broadcast binding updates to editors and galleries

### 8.2 Override flow (`request_bind_wall`)

1. editor requests bind with `requestId`
2. server checks conflict against current wall binding
3. if no conflict (or same-user live continuation), bind immediately
4. if conflict and gallery approver exists, send `bind_override_requested`
5. gallery sends `bind_override_decision`
6. server sends `bind_override_result` and binds on approval
7. timeout auto-denies after `BIND_OVERRIDE_TIMEOUT_MS` (20s)

### 8.3 Unbind paths

- explicit `unbind_wall` message
- wall disconnect grace expiry
- last-editor-leaves-scope auto-unbind for `live` bindings
- admin/server flows calling shared unbind logic

Unbind fanout includes hydrate-empty to walls/controllers and binding broadcasts to editors/galleries.

## 9) Layer and Fanout Semantics

### 9.1 Persistent layers

- `upsert_layer`/`delete_layer` mutate `scopedState.layers`
- marks scope dirty and invalidates hydrate cache
- fanout to scope peers

### 9.2 Controller transient overlays

`origin: 'controller:add_line_layer'` writes to per-wall transient store:

- no DB persistence
- no editor fanout
- only wall peers + sibling controllers for same wall
- merged into wall hydrate payload by `numericId`

### 9.3 Yjs-driven text updates

- `process.__YJS_UPSERT_LAYER__` upserts text layer into scope
- marks dirty + invalidates cache
- emits `upsert_layer` with `origin:'yjs:sync'`

## 10) Video Sync Model

Command handlers:

- `video_play`
- `video_pause`
- `video_seek`

Behavior:

- anti-reorder gate via issued timestamp (`shouldApplyPlaybackCommand`)
- authoritative playback state stored in scope layer
- immediate sync frames to relevant walls on command
- periodic VSYNC loop (`500ms`) emits binary `VIDEO_SYNC` batches

## 11) Background Loops and Process Bridges

Intervals in `/bus`:

- video VSYNC loop: `500ms`
- autosave dirty scopes: `30s`
- stale peer reaper: `10s`

Process bridges:

- `__BROADCAST_EDITORS__`
- `__BROADCAST_ASSET_ADDED__`
- `__BROADCAST_WALL_BINDING_CHANGED__`
- `__BROADCAST_PROJECTS_CHANGED__`
- `__REBOOT_WALL__`
- `__REBOOT_DEVICE__`
- `__DISCONNECT_DEVICE__`
- `__BUS_RECOMPUTE_AUTH_CONTEXT__`
- `__YJS_UPSERT_LAYER__`

## 12) YJS Co-Bus Integration

Yjs route: `apps/web/src/routes/yjs.$.ts`

Responsibilities:

- per-doc CRDT sync + awareness relay
- persist Yjs binary state to `ydocs`
- convert Yjs -> HTML via Lexical
- bridge text updates back into `/bus`

Flow summary:

1. Yjs peer sends doc updates
2. shared doc marked dirty
3. periodic flush persists `ydocs`
4. flush computes HTML
5. bridge calls `__YJS_UPSERT_LAYER__`
6. `/bus` updates scope layer and fans out

## 13) Operational Constraints

- bus state is process-local; multi-worker deployments need sticky routing or shared infra for strong consistency
- some flows fan out realtime updates before DB writes complete (eventual DB convergence)
- numeric layer IDs are scope-local in intent; global registries must include scope context to avoid collisions

## 14) Mental Model

- editors operate in scope space
- walls are bound to scopes
- controllers and galleries operate through wall binding context
- Yjs is a specialized text co-bus that converges back into scope state through the bridge
