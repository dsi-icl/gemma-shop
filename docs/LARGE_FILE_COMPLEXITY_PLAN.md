# Large File Complexity Plan

Last updated: 2026-04-06

## Why this doc exists

Backlog plan to reduce complexity in very large files while preserving behaviour.

## Largest Files (current line counts)

| File | Lines | Change since last audit |
|------|-------|-------------------------|
| `apps/web/src/routes/bus.ts` | 2418 | +167 |
| `apps/web/src/lib/busState.ts` | 1474 | +167 |
| `apps/web/src/components/EditorSlate.tsx` | 1331 | +120 |
| `apps/web/src/routeTree.gen.ts` | ~1149 | generated — do not touch |
| `apps/web/src/lib/editorStore.ts` | 1194 | +100 |
| `apps/web/src/routes/controller/index.tsx` | 1102 | +77 |
| `apps/web/src/components/EditorToolbar.tsx` | 918 | +49 |
| `apps/web/src/routes/wall/index.tsx` | 813 | +54 |
| `apps/web/src/routes/yjs/$.ts` | 820 | +76 |
| `packages/ui/components/morphing-dialog.tsx` | 827 | +74 |
| `apps/web/src/server/projects.ts` | 615 | ~stable |
| `apps/web/src/server/admin.ts` | 593 | ~stable |

---

## Priority Order (highest payoff first)

1. `bus.ts` — largest file; 9 distinct logical groups; very hard to reason about
2. `busState.ts` — second largest; server-side singleton with 10+ responsibilities
3. `EditorSlate.tsx` + `controller/index.tsx` — share ~40% identical layer-render code
4. `editorStore.ts` — Zustand store with unrelated action groups mixed together
5. `EditorToolbar.tsx` — UI sections loosely coupled; extract by toolbar region
6. `wall/index.tsx` + `yjs/$.ts` — moderate size, clear section boundaries
7. `projects.ts` + `admin.ts` — already manageable; split only if they grow

---

## Proposed Split Map

### 1) `apps/web/src/routes/bus.ts` → `apps/web/src/routes/bus/`

**Current sections:**
- Lines 1–176: imports, opcodes, binary helpers, playback dedup, message-type sets
- Lines 246–448: WS auth (permission cache, rate-limit enforcement, message authorisation)
- Lines 450–753: wall binding state machine (bind/unbind, override flow, gallery snapshot, wall-count broadcast)
- Lines 755–797: cryptographic device verification (ECDSA)
- Lines 799–1218: peer registration (editor, device hello, scope vacate, auth recompute)
- Lines 1220–1668: message handlers (layer mutations, scope transitions, wall bind/unbind requests, overrides)
- Lines 1670–1850: video sync handlers + authentication handshake (hello / hello_auth / switch_scope)
- Lines 1884–2012: binary dispatch + WebSocket lifecycle (open/close)
- Lines 2014–2410: JSON/binary router, process bridges, background loops (VSYNC, AUTO_SAVE, REAPER)

**Target structure:**
```
apps/web/src/routes/bus/
  index.ts                  — route export, HTTP fallback, background loops (VSYNC/AUTO_SAVE/REAPER)
  constants.ts              — opcodes, message-type sets, binary helpers
  auth.ts                   — getCachedEditorPermission, isWsMessageAuthorized, enforceWsRateLimit
  crypto.ts                 — verifyDeviceSignature, base64UrlToBytes helpers
  peers.ts                  — registerEditorPeer, completeHelloRegistration, handleEditorScopeVacated, recomputePeerAuthContexts
  binding.ts                — performLiveBind, clearPendingBindOverride, broadcastWallBinding*, sendBindOverrideResult
  handlers/
    handshake.ts            — handleHello, handleHelloAuth, handleSwitchScope
    layers.ts               — upsert_layer, delete_layer, seed_scope, update_slides
    scopes.ts               — stage_dirty, leave_scope, stage_save, rehydrate_please, clear_stage
    wall.ts                 — bind_wall, request_bind_wall, unbind_wall, bind_override_decision
    video.ts                — video_play, video_pause, video_seek
  bridges.ts                — ⚠ DO NOT use as a separate module. Each handler module
                              registers its own process bridges at module scope. index.ts
                              registers any bridges that span multiple handler modules.
```

---

### 2) `apps/web/src/lib/busState.ts` → `apps/web/src/lib/busState/`

**Current sections:**
- Lines 1–216: HMR state init, telemetry, scope interning, peer types, master indexes, node-count queries
- Lines 232–399: peer register/unregister, scope create, YDoc cleanup, hydrate payload generation
- Lines 470–609: controller transient layers, wall binding state machine, backpressure, playback lead
- Lines 611–829: broadcast primitives (JSON, binary, scoped variants), video tracking
- Lines 897–1037: video sync encoding (VSYNC binary format), wall unbind grace, scope GC scheduling
- Lines 1040–1256: scope GC execution, scope resolution, stale peer reaping, logging, DB seed
- Lines 1259–1475: slide snapshot, scope save logic, slide metadata persistence, asset change stream

**Target structure:**
```
apps/web/src/lib/busState/
  index.ts                  — re-exports everything public (keep call sites unchanged)
  state.ts                  — HMR-persistent globals, master indexes, telemetry, scope interning
                              ⚠ MUST NOT import from any sibling — it is the root of the dep tree
  peers.ts                  — registerPeer, unregisterPeer, reapStalePeers, peer type defs
                              imports: state.ts
  scopes.ts                 — getOrCreateScope, resolveScopeId, setEditorScope, hydrate payloads
                              imports: state.ts, peers.ts
  binding.ts                — bindWall, unbindWall, scheduleWallUnbindGrace, backpressure helpers
                              imports: state.ts, scopes.ts
  broadcast.ts              — sendJSON, broadcastTo* family, video tracking, video sync binary encoding
                              imports: state.ts, scopes.ts
  persistence.ts            — saveScope, buildSlidesSnapshot, persistSlideMetadata, seedScopeFromDb, scopeGC
                              imports: state.ts, scopes.ts, broadcast.ts, binding.ts (for grace timers)
  assets.ts                 — startAssetChangeStream, broadcastAssetToEditorsByProject
                              imports: state.ts, broadcast.ts
```

**Dependency order (no cycles):** `state → peers → scopes → binding / broadcast → persistence → assets`

The HMR `_hmr` singleton in `state.ts` must remain the sole owner of the mutable maps. All sibling modules reference it by importing named exports from `state.ts` — they never re-export the maps themselves.

---

### 3) `apps/web/src/components/EditorSlate.tsx` → `apps/web/src/components/editor-slate/`

**Current sections:**
- Lines 1–110: imports, geometry utils (snap, distance, angle, touch-to-stage)
- Lines 111–264: store subscriptions, auto-scroll, resize observer, canvas initialisation
- Lines 266–530: mouse + touch/pinch gesture handlers (drag, rotate, zoom)
- Lines 532–664: drawing mode (line point accumulation)
- Lines 666–840: selection + Transformer integration (bounding box update)
- Lines 842–1023: file upload + drag-drop pipeline
- Lines 1025–1100: keyboard shortcuts
- Lines 1102–1319: layer render + JSX structure

**Target structure:**
```
apps/web/src/components/editor-slate/
  EditorSlate.tsx           — composition root; JSX structure only (~150 lines)
  geometry.ts               — snapToGrid, getDistance, getAngle, normalizeRotation, touchToStagePoint
  hooks/
    useEditorCanvas.ts      — canvas init, resize observer, auto-scroll
    useGestures.ts          — mouse + touch/pinch handlers
    useDrawing.ts           — drawing mode, line point accumulation
    useSelection.ts         — Transformer integration, selection bounding box
    useUpload.ts            — file upload, drag-drop pipeline, keyboard shortcuts
  layers/
    LayerRenderer.tsx       — switch over layer types → delegates to individual renderers
    ImageLayer.tsx
    VideoLayer.tsx
    MapLayer.tsx
    WebLayer.tsx
    TextLayer.tsx
    ShapeLayer.tsx
    LineLayer.tsx
```

> **Note:** `controller/index.tsx` and `wall/index.tsx` share ~identical layer-render logic.
> Extract `LayerRenderer` as a shared component used by all three — the biggest quick win for code reduction.

---

### 4) `apps/web/src/lib/editorStore.ts` → `apps/web/src/lib/editorStore/`

**Current sections:**
- Lines 30–142: EditorState interface + store initialisation
- Lines 144–403: hydration, scope switching, slide sync, layer upsert/delete, position updates
- Lines 405–651: layer styling (stroke, fill, z-order, dimensions, text edit)
- Lines 653–749: layer creation (text, map, web, shape, line)
- Lines 751–910: selection logic + tool state (snap, grid, draw)
- Lines 912–987: drawing/shape line finalisation
- Lines 989–1075: wall binding + unbind
- Lines 1077–1194: save operations, UI state, computed selectors

**Target structure:**
```
apps/web/src/lib/editorStore/
  index.ts                  — createStore(), re-exports useEditorStore and selectors
  types.ts                  — EditorState interface
  selectors.ts              — only if selectors are substantial; likely ~30 lines, fold into index.ts
  actions/
    hydration.ts            — onHydrate, switch_scope, update_slides
    layers.ts               — upsertLayer, deleteLayer, updatePosition
    styling.ts              — z-order, stroke, fill, dimensions, text edit
    creation.ts             — addTextLayer, addMapLayer, addWebLayer, addShapeLayer, addLineLayer
    selection.ts            — toggleLayerSelection, deselectAll, tool state
    drawing.ts              — updateLinePoints, finishLineDrawing
    binding.ts              — bindWall, requestBindWall, unbindWall, wall_binding_status
    save.ts                 — saveProject, markDirty
```

---

### 5) `apps/web/src/routes/controller/index.tsx`

**Current sections:**
- Lines 59–118: line-layer builder (duplicates wall's logic)
- Lines 120–580: state init, wall binding signal, hydrate, layer CRUD, drawing
- Lines 582–720: layer rendering (duplicates wall's layer rendering)
- Lines 722–1102: touch drawing, UI overlay, JSX

**Target structure:**
```
apps/web/src/routes/controller/
  index.tsx                 — route shell, composition (~100 lines)
  hooks/
    useControllerSession.ts — WS lifecycle, hydrate, binding signal, layer state
    useControllerDrawing.ts — drawing mode, line creation, touch/pinch
  components/
    ControllerOverlay.tsx   — toolbar, binding signal, slide navigator
```

> Shares `LayerRenderer` with editor-slate and wall once that's extracted (see §3).

---

### 6) `apps/web/src/components/EditorToolbar.tsx` → `apps/web/src/components/editor-toolbar/`

**Current sections:**
- Lines 64–282: state subscriptions, save/commit popover logic, web-layer controls
- Lines 299–380: wall bind/unbind UI + override listener
- Lines 382–601: title bar, content creation buttons, save status, bind buttons, tool toggles
- Lines 605–830: layer-specific tools (ordering, filters, text, appearance, video)
- Lines 832–918: web layer URL input, dialogs

**Target structure:**
```
apps/web/src/components/editor-toolbar/
  EditorToolbar.tsx         — composition root; renders toolbar sections
  hooks/
    useToolbarState.ts      — all store subscriptions and derived state
    useWebLayerControls.ts  — URL, proxy toggle, screenshot capture
    useWallBindingUI.ts     — bind/unbind, override listener
  sections/
    TitleBar.tsx
    ContentButtons.tsx      — upload, shapes, text, map, web, draw
    SaveButton.tsx          — commit message popover + auto-save status
    BindButton.tsx          — live preview / wall binding
    ToolToggles.tsx         — snap, grid, refresh, clear stage
    LayerTools.tsx          — ordering, filters, text edit, appearance, video controls
    WebLayerPanel.tsx       — URL input, proxy/screenshot controls
```

---

### 7) `apps/web/src/routes/wall/index.tsx`

**Current sections:**
- Lines 1–124: imports, route, device enrollment check, viewport calc, engine init
- Lines 154–384: hydrate fade, animation rAF loop, AABB culling
- Lines 386–517: URL frameability pre-flight, QR enrollment
- Lines 519–781: layer rendering + custom render iframe
- Lines 783–814: DOM root, debugger overlay, HMR disposal

**Target structure:**
```
apps/web/src/routes/wall/
  index.tsx                 — route shell, engine lifecycle, DOM root
  hooks/
    useWallHydration.ts     — hydrate queue, fade transitions
    useWallAnimationLoop.ts — rAF loop, AABB culling, layer visibility
    useWallEnrollment.ts    — QR generation, device enrollment check
  WallLayerRenderer.tsx     — (or shared LayerRenderer from editor-slate, see §3)
```

---

### 8) `apps/web/src/routes/yjs/$.ts`

**Current sections:**
- Lines 1–218: imports, constants, Lexical DOM globals, binary utils, scope parsing
- Lines 224–360: HTML↔YJS conversion, text layer DB load, MongoDB persistence adapter
- Lines 362–424: SharedDoc class (awareness, sync loop, peer tracking)
- Lines 426–713: yCrossws handler (open: auth, sync step1, doc init; message: sync/awareness protocols; close: cleanup, flush)
- Lines 715–820: auth recomputation, route export, process bridge

**Target structure:**
```
apps/web/src/routes/yjs/
  index.ts                  — route export, crossws hooks composition, process bridge
  lexical.ts                — withLexicalDomGlobals, htmlToYUpdate, yDocToHtml, applyHtmlToDoc
  persistence.ts            — MongoYDocPersistence, loadTextLayer, flushDoc
  sharedDoc.ts              — SharedDoc class (Y.Doc subclass, awareness, sync loop)
  handlers.ts               — onOpen (auth + sync), onMessage (sync/awareness), onClose (cleanup)
  auth.ts                   — recomputeYjsPeerAuthContexts
```

---

### 9) `apps/web/src/server/projects.ts` (615 lines)

Already a reasonable size; split only if it grows further. Natural fault lines when it does:

```
apps/web/src/server/projects/
  crud.ts         — createProject, updateProject, archiveProject, restoreProject, getProject, listProjects
  commits.ts      — getCommit, getProjectCommits, ensureMutableHead, createBranchHead, promoteBranchHead
  publish.ts      — publishCommit, publishCustomRenderProject
  assets.ts       — listAssets, deleteAsset, revokeUploadTokenForActor
```

---

### 10) `apps/web/src/server/admin.ts` (593 lines)

Same — park unless it grows. Natural split when needed:

```
apps/web/src/server/admin/
  users.ts    — adminListUsers
  projects.ts — adminListProjects
  walls.ts    — adminListWalls, adminCreateWall, adminGetWall, adminDeleteWall, adminUpdateWallMetadata, adminUnbindWall
  devices.ts  — adminListDevices*, adminEnrollDevice, adminDeleteDevice, adminListDevicesForWall  (* moves from devices.ts)
  assets.ts   — adminListPublicAssets, adminDeletePublicAsset, adminGetUploadToken
  config.ts   — adminGetStats, adminGetConfig, adminSetConfig, adminSendTestEmail
```

---

## Shared Layer Renderer — highest quick win (wall + controller only)

`wall/index.tsx` and `controller/index.tsx` share near-identical HTML/CSS layer-rendering code (~200–250 lines each, using `<div>`, `<img>`, `<iframe>`, `<video>` with `commonProps` pattern). Extracting a shared `WallLayerRenderer` between these two eliminates ~200–250 lines of duplication.

**`EditorSlate.tsx` is NOT a candidate for this shared renderer.** It renders via Konva (canvas), using `<KonvaStaticImage>`, `<KonvaVideo>`, `<Rect>` — a completely different render target with editor-specific props (`onSelect`, `onTransform`, Transformer refs). The editor split stands on its own.

---

## Refactor Guardrails

- One file family per PR; no mega-refactors.
- Public API (exported names) stays stable during a split — only internals move.
- Re-export from `index.ts` so call sites do not change.
- Run `tsc --noEmit` + smoke-test WS flows after each split.
- Do not touch `routeTree.gen.ts` directly.

---

## Suggested Milestones

| Milestone | Files | Notes |
|-----------|-------|-------|
| 0 | Extract `WallLayerRenderer` shared between wall + controller | ~200–250 lines saved; unblocks milestones 4 & 5 |
| 0b | Replace `generateSlideId()` in `editorStore.ts` with `crypto.randomUUID()` | Minor cleanup; consistent with server-side slide ID generation |
| 1 | Split `bus.ts` → `bus/` | Highest complexity; bridges stay per-handler or in index.ts |
| 2 | Split `busState.ts` → `busState/` | Follow dep order: state → peers → scopes → binding/broadcast → persistence → assets |
| 3 | Extract `yjs/lexical.ts` from `yjs/$.ts` | Most self-contained extraction; zero WS dependencies |
| 4 | Split `editorStore.ts` → `editorStore/` | Unblocks EditorSlate split |
| 5 | Split `EditorSlate.tsx` + `EditorToolbar.tsx` | Editor Konva renderer stays separate from WallLayerRenderer |
| 6 | Split `controller/index.tsx` + `wall/index.tsx` | Simplified by shared WallLayerRenderer from milestone 0 |
| 7 | Full `yjs/$.ts` split | After lexical.ts extracted, remaining split is straightforward |
| 8 | Split `projects.ts` + `admin.ts` if grown | Only if they exceed ~800 lines |

---

## Recent Progress

### 2026-04-03
- Endpoint auth matrix (`docs/ENDPOINTS_AUDIT.md`) refreshed.
- `/bus` authz tightened (`seed_scope` moved to edit-authorized set).
- `/api/assets/$uri` returns 404 for unauthorized authenticated users.

### 2026-04-06
- Removed all serializers (`project/asset/wall/commit/audit.serializer.ts`).
- Deleted `packages/db/src/schema/` directory; replaced with flat `schema.ts`.
- All foreign keys (`projectId`, `authorId`, `parentId`, etc.) now `string` in document interfaces — ObjectId conversion owned entirely by collection layer.
- `deviceId` removed as a concept; MongoDB-generated `id` used everywhere.
- `serialization.ts` deleted; `serializeForClient` was the last consumer.
- `CreateProjectInput` / `UpdateProjectInput` inlined into `projects.fns.ts`; removed from shared schema.
