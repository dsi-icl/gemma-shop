# Endpoints Audit

Last reviewed: 2026-04-03

This is a fresh, full endpoint inventory across REST, ServerFn, and WebSocket surfaces.

Column meanings:

- `Has authContext`: whether request/connection-level auth context is derived and available.
- `Device-signing policy`: current requirement/status for HTTP device signatures.
- `Access control policy`: gates currently enforced (authentication only, not full authorization review).
- `Comments`: usage notes, known limitations, and follow-up flags.

## REST Endpoints

| Endpoint                     | File                                          | Has authContext                                           | Device-signing policy                           | Access control policy                                                                  | Comments                                                                                       |
| ---------------------------- | --------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET/POST /api/auth/$`       | `apps/web/src/routes/api/auth/$.ts`           | Yes (upstream in `start.ts`)                              | Not required                                    | Delegated to Better Auth handler                                                       | Active (in-repo). Auth provider endpoint.                                                      |
| `GET /api/assets/$uri`       | `apps/web/src/routes/api/assets/$uri.ts`      | Yes (upstream in `start.ts`)                              | Optional at caller level; not required by route | Public asset stream; no actor check in route                                           | Active (in-repo). For private-asset policy, future authorization pass still needed.            |
| `ANY /api/uploads/$`         | `apps/web/src/routes/api/uploads/$.ts`        | Yes (upstream in `start.ts`)                              | Not required (token-based flow)                 | Requires valid upload token; finalize rate limit; media/magic-byte checks              | Active (in-repo). Upload token store currently in-memory/unsigned (known limitation).          |
| `POST /api/web-screenshot`   | `apps/web/src/routes/api/web-screenshot.ts`   | Yes (consumed from context)                               | Not accepted for auth at this endpoint          | Requires `authContext.user.email` (session user), plus rate limit and SSRF protections | Active (in-repo). User-session only by current policy.                                         |
| `POST /api/report-csp`       | `apps/web/src/routes/api/report-csp.ts`       | Yes (upstream in `start.ts`)                              | Not required                                    | Public CSP report sink                                                                 | Active (in-repo via CSP reporting config).                                                     |
| `POST /api/portal/v1/reboot` | `apps/web/src/routes/api/portal/v1/reboot.ts` | Yes (upstream in `start.ts`)                              | Not used here; bearer token flow instead        | Requires valid portal token; token wall binding consistency checks                     | Active (external API). Intentionally externally consumed.                                      |
| `GET /proxy` (addon route)   | `apps/web/src/addons/routes/proxy.ts`         | Yes (resolved in handler via `resolveRequestAuthContext`) | Caller-dependent; wall flow signs request       | Origin/referrer allowlist policy; no actor enforcement yet                             | Active (in-repo). Not under `start.ts` middleware tree; keep tracked for route-tree migration. |

## ServerFn Endpoints

### `apps/web/src/server/projects.fns.ts`

| Endpoint                      | Has authContext | Device-signing policy | Access control policy                                  | Comments                                          |
| ----------------------------- | --------------- | --------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| `$listProjects`               | Yes             | Not required          | `authMiddleware` (session user required)               | Active (in-repo).                                 |
| `$listPublishedProjects`      | Yes             | Not required          | Public (no auth middleware)                            | Active (in-repo). Guest/public listing by design. |
| `$listKnownTags`              | Yes             | Not required          | `authMiddleware`                                       | Active (in-repo).                                 |
| `$listAssets`                 | Yes             | Not required          | `authMiddleware`                                       | Active (in-repo).                                 |
| `$getProject`                 | Yes             | Not required          | `authMiddleware` + collaborator/owner check in handler | Active (in-repo).                                 |
| `$getCommit`                  | Yes             | Not required          | `authMiddleware` + collaborator/owner check in handler | Active (in-repo).                                 |
| `$createProject`              | Yes             | Not required          | `authMiddleware`                                       | Active (in-repo).                                 |
| `$updateProject`              | Yes             | Not required          | `authMiddleware`                                       | Active (in-repo).                                 |
| `$archiveProject`             | Yes             | Not required          | `authMiddleware`                                       | Active (in-repo).                                 |
| `$deleteAsset`                | Yes             | Not required          | `authMiddleware`                                       | Active (in-repo).                                 |
| `$restoreProject`             | Yes             | Not required          | `authMiddleware`                                       | Active (in-repo).                                 |
| `$publishCommit`              | Yes             | Not required          | `authMiddleware`                                       | Active (in-repo).                                 |
| `$publishCustomRenderProject` | Yes             | Not required          | `authMiddleware`                                       | Active (in-repo).                                 |
| `$getAuditLogs`               | Yes             | Not required          | `authMiddleware`                                       | Active (in-repo).                                 |
| `$ensureMutableHead`          | Yes             | Not required          | `authMiddleware`                                       | Active (in-repo).                                 |
| `$getProjectCommits`          | Yes             | Not required          | `authMiddleware`                                       | Active (in-repo).                                 |
| `$createBranchHead`           | Yes             | Not required          | `authMiddleware`                                       | Active (in-repo).                                 |
| `$promoteBranchHead`          | Yes             | Not required          | `authMiddleware`                                       | Active (in-repo).                                 |
| `$copySlideInCommit`          | Yes             | Not required          | `authMiddleware`                                       | Active (in-repo).                                 |
| `$deleteSlideFromCommit`      | Yes             | Not required          | `authMiddleware`                                       | Active (in-repo).                                 |
| `$createUploadToken`          | Yes             | Not required          | `authMiddleware`                                       | Active (in-repo).                                 |
| `$revokeUploadToken`          | Yes             | Not required          | `authMiddleware` + actor-aware revoke check in service | Active (in-repo).                                 |
| `$validateUploadToken`        | Yes             | Not required          | Public (token validation endpoint)                     | Active (in-repo).                                 |

### `apps/web/src/server/admin.fns.ts`

| Endpoint                         | Has authContext | Device-signing policy | Access control policy | Comments          |
| -------------------------------- | --------------- | --------------------- | --------------------- | ----------------- |
| `$adminListUsers`                | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |
| `$adminListProjects`             | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |
| `$adminGetStats`                 | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |
| `$adminListWalls`                | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |
| `$adminListPublicAssets`         | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |
| `$adminDeletePublicAsset`        | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |
| `$adminUnbindWall`               | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |
| `$adminCreateWall`               | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |
| `$adminGetWall`                  | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |
| `$adminUpdateWallMetadata`       | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |
| `$adminDeleteWall`               | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |
| `$adminGetUploadToken`           | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |
| `$adminGetWallBindingMeta`       | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |
| `$adminListConfig`               | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |
| `$adminSetConfig`                | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |
| `$adminSendSmtpTest`             | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |
| `$adminDevicesList`              | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |
| `$adminDevicesForWall`           | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |
| `$adminDevicesEnrollBySignature` | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |
| `$adminSetUserBanStatus`         | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |

### `apps/web/src/server/walls.fns.ts`

| Endpoint     | Has authContext | Device-signing policy | Access control policy | Comments          |
| ------------ | --------------- | --------------------- | --------------------- | ----------------- |
| `$listWalls` | Yes             | Not required          | `adminMiddleware`     | Active (in-repo). |

### `apps/web/src/server/portal.fns.ts`

| Endpoint                      | Has authContext | Device-signing policy                                             | Access control policy                                                                                      | Comments                                                                         |
| ----------------------------- | --------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `$issueControllerPortalToken` | Yes             | Recommended/used by gallery caller; not hard-required by endpoint | `actorAuthContextMiddleware` (any authenticated actor from derived context) + wall must currently be bound | Active (in-repo). This is still the bridge for external `/api/portal/v1/reboot`. |

### `apps/web/src/server/bootstrap.fns.ts`

| Endpoint                            | Has authContext | Device-signing policy | Access control policy                               | Comments          |
| ----------------------------------- | --------------- | --------------------- | --------------------------------------------------- | ----------------- |
| `$bootstrapStatus`                  | Yes             | Not required          | Public bootstrap state endpoint                     | Active (in-repo). |
| `$requestBootstrapSetupCodeDisplay` | Yes             | Not required          | Public bootstrap phase endpoint                     | Active (in-repo). |
| `$verifyBootstrapSetupCode`         | Yes             | Not required          | Public bootstrap phase endpoint                     | Active (in-repo). |
| `$submitBootstrapAdminAndSmtp`      | Yes             | Not required          | Public bootstrap phase endpoint                     | Active (in-repo). |
| `$verifyBootstrapOtpAndFinalize`    | Yes             | Not required          | Public bootstrap phase endpoint                     | Active (in-repo). |
| `$finalizeFirstAdminForCurrentUser` | Yes             | Not required          | `freshAuthMiddleware` + bootstrap completion checks | Active (in-repo). |

## WebSocket Endpoints

### `WS /bus` (`apps/web/src/routes/bus.ts`)

| Message type              | Direction     | Has authContext                                              | Device-signing policy                                                   | Access control policy                                                             | Comments                                   |
| ------------------------- | ------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| `hello`                   | C->S          | Editor: derived from session; device peers pending challenge | Required for device peers through challenge flow when using device auth | Editor requires session; wall/controller/gallery proceed to challenge             | Active. Entry point for peer registration. |
| `hello_challenge`         | S->C          | N/A (challenge stage)                                        | Server nonce challenge                                                  | Sent to wall/controller/gallery after `hello`                                     | Active.                                    |
| `hello_auth`              | C->S          | Completes peer auth context for device/portal paths          | Device signature and/or controller portal token                         | Signature validated for devicePublicKey path; portal token allowed for controller | Active.                                    |
| `hello_authenticated`     | S->C          | Yes                                                          | N/A                                                                     | Sent after successful hello auth/registration                                     | Active.                                    |
| `auth_denied`             | S->C          | N/A                                                          | N/A                                                                     | Sent when editor session missing (or recompute invalidates)                       | Active.                                    |
| `switch_scope`            | C->S          | Yes (editor peer required)                                   | Not used at message level                                               | Editor-only enforced in handler                                                   | Active.                                    |
| `rehydrate_please`        | C->S          | Yes (registered peer required)                               | Not used at message level                                               | Behavior depends on registered specimen                                           | Active.                                    |
| `hydrate`                 | S->C          | Yes (peer scoped)                                            | N/A                                                                     | Snapshot payload for editor/wall/controller scope state                           | Active.                                    |
| `upsert_layer`            | C<->S         | Yes                                                          | Not used at message level                                               | Registered peer required; transient path restricted to controller origin          | Active.                                    |
| `delete_layer`            | C<->S         | Yes                                                          | Not used at message level                                               | Registered peer required; transient delete path restricted to controller origin   | Active.                                    |
| `seed_scope`              | C->S          | Yes                                                          | Not used at message level                                               | Registered peer required                                                          | Active.                                    |
| `clear_stage`             | C->S          | Yes                                                          | Not used at message level                                               | Registered peer required                                                          | Active.                                    |
| `update_slides`           | C->S          | Yes                                                          | Not used at message level                                               | Registered peer required; persists and fanouts                                    | Active.                                    |
| `slides_updated`          | S->C          | Yes                                                          | N/A                                                                     | Broadcast to editors/controllers on commit updates                                | Active.                                    |
| `stage_dirty`             | C->S          | Yes                                                          | Not used at message level                                               | Registered peer required                                                          | Active.                                    |
| `stage_save`              | C->S          | Yes                                                          | Not used at message level                                               | Registered peer required; async save + response                                   | Active.                                    |
| `stage_save_response`     | S->C          | Yes                                                          | N/A                                                                     | Save result to requester and peer set                                             | Active.                                    |
| `leave_scope`             | C->S          | Yes                                                          | Not used at message level                                               | Editor-only effect (unscopes editor peer)                                         | Active.                                    |
| `bind_wall`               | C->S          | Yes                                                          | Not used at message level                                               | Accepted for controllers/system path; editor flow should use `request_bind_wall`  | Active.                                    |
| `request_bind_wall`       | C->S          | Yes                                                          | Not used at message level                                               | Editor-only; may trigger gallery override flow                                    | Active.                                    |
| `bind_override_requested` | S->C          | Yes                                                          | N/A                                                                     | Sent to gallery approvers for conflict resolution                                 | Active.                                    |
| `bind_override_decision`  | C->S          | Yes                                                          | Not used at message level                                               | Gallery-only and wallId-scoped check enforced                                     | Active.                                    |
| `bind_override_result`    | S->C          | Yes                                                          | N/A                                                                     | Result to requester/galleries (`approved/denied/timeout/...`)                     | Active.                                    |
| `unbind_wall`             | C->S          | Yes                                                          | Not used at message level                                               | Registered peer required                                                          | Active.                                    |
| `wall_binding_status`     | S->C          | Yes                                                          | N/A                                                                     | Broadcast/snapshot to editor/controller                                           | Active.                                    |
| `wall_binding_changed`    | S->C          | Yes                                                          | N/A                                                                     | Broadcast to galleries/editors on binding changes                                 | Active.                                    |
| `wall_unbound`            | S->C          | Yes                                                          | N/A                                                                     | Gallery-facing unbind event                                                       | Active.                                    |
| `wall_node_count`         | S->C          | Yes                                                          | N/A                                                                     | Editor-facing wall connection counts                                              | Active.                                    |
| `gallery_state`           | S->C          | Yes                                                          | N/A                                                                     | Gallery state snapshot (walls + published projects)                               | Active.                                    |
| `project_publish_changed` | S->C          | Yes                                                          | N/A                                                                     | Publish/unpublish fanout                                                          | Active.                                    |
| `asset_added`             | S->C          | Yes                                                          | N/A                                                                     | Upload bridge fanout to editors by project                                        | Active.                                    |
| `device_enrollment`       | S->C          | Yes                                                          | N/A                                                                     | Enrollment hint for pending device records                                        | Active.                                    |
| `video_play`              | C->S          | Yes                                                          | Not used at message level                                               | Registered peer required; playback ordering guards                                | Active.                                    |
| `video_pause`             | C->S          | Yes                                                          | Not used at message level                                               | Registered peer required; playback ordering guards                                | Active.                                    |
| `video_seek`              | C->S          | Yes                                                          | Not used at message level                                               | Registered peer required; playback ordering guards                                | Active.                                    |
| `video_sync`              | S->C          | Yes                                                          | N/A                                                                     | Playback synchronization fanout                                                   | Active.                                    |
| `reboot`                  | C->S and S->C | Yes                                                          | Not used at message level                                               | Reboot relayed to wall peers in scope/wall bridge calls                           | Active.                                    |
| `rate_limited`            | S->C          | Yes                                                          | N/A                                                                     | WS mutation rate-limit response/strike path                                       | Active.                                    |
| `ping` / `pong`           | C<->S         | Yes                                                          | N/A                                                                     | JSON clock messages; binary clock opcode path also exists                         | Active.                                    |

Notes for `/bus`:

- WS mutation rate limiting is enforced for state-changing message types.
- `authContext` is stored in `PeerMeta` after registration and used for recompute/disconnect flows.
- `requesterEmail` for bind override is server-derived from peer auth context (not trusted client payload).

### `WS /yjs/$` (`apps/web/src/routes/yjs/$.ts`)

| Message type                       | Direction | Has authContext                                       | Device-signing policy | Access control policy                                                                                      | Comments |
| ---------------------------------- | --------- | ----------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| `sync` (Yjs message type `0`)      | C<->S     | Yes (peer open must resolve authenticated user email) | Not used              | On `open`, unauthenticated peers are closed; `onMessage` waits for open completion and closes if not ready | Active.  |
| `awareness` (Yjs message type `1`) | C<->S     | Yes (same as above)                                   | Not used              | Same authenticated-open gate as sync messages                                                              | Active.  |

Notes for `/yjs/$`:

- Peer state stores editor-shaped meta with `authContext.user.email`.
- Scope/doc parsing and text-layer existence checks are enforced before doc hydration.

## Current Gaps To Track (Authentication Derivation Scope)

- `GET /proxy` resolves auth context but does not yet enforce actor-based gate; currently relies on origin/referrer policy.
- `GET /api/assets/$uri` has auth context available but route currently behaves as public stream endpoint.
- HTTP device-signing is available in the shared resolver/signing contract, but enforcement remains endpoint-by-endpoint (not globally mandatory).

## No Active Usage Findings

- No endpoint in this inventory is currently marked `No active usage found`.
- `/api/portal/v1/reboot` is intentionally classified as `Active (external)`.
