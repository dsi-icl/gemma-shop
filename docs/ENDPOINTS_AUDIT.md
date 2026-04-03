# Endpoints Audit

Last reviewed: 2026-04-02 10:32

Scope for this audit:

- REST-style HTTP endpoints in `apps/web/src/routes/api/*` and Nitro addon HTTP routes.
- TanStack server function endpoints (`createServerFn`) under `apps/web/src/server/*.fns.ts`.
- WebSocket endpoints in Nitro addon routes.

Usage labeling:

- `Active (in-repo)` means there is at least one in-repo caller/reference beyond the endpoint definition.
- `Active (external)` means the endpoint is intentionally consumed by external clients outside this repository.
- `No active usage found` means no in-repo caller was found (endpoint may still be used by external clients/manual tooling).

## REST Endpoints

| Endpoint                     | File                                          | Access-control gates observed                                                                                                                                                                                                                                                                               | Usage status      | Usage evidence                                                                                                                     |
| ---------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --- |
| `GET/POST /api/auth/$`       | `apps/web/src/routes/api/auth/$.ts`           | Delegates to `auth.handler(request)` from Better Auth. Effective gates are configured in `packages/auth/src/auth.ts` (trusted origins, allowed hosts, session/cookie checks, auth plugins).                                                                                                                 | Active (in-repo)  | `authClient` in `packages/auth/src/auth-client.ts` with app login/logout usage in guest/admin/header components.                   |     |
| `GET /api/assets/$uri`       | `apps/web/src/routes/api/assets/$uri.ts`      | No auth gate. Public asset serving endpoint with path sanitization (`basename`) and range/caching behavior.                                                                                                                                                                                                 | Active (in-repo)  | Many `/api/assets/...` consumers in app/UI components.                                                                             |     |
| `ANY /api/uploads/$`         | `apps/web/src/routes/api/uploads/$.ts`        | Upload finalize enforces `uploadToken` presence + validity (`validateUploadToken`), finalize rate limit (`checkRateLimit`), and media type/magic-byte validation before asset write/DB insert.                                                                                                              | Active (in-repo)  | Upload endpoints used in `EditorSlate.tsx`, `UploadDialog.tsx`, `routes/upload/$projectId.tsx`.                                    |     |
| `POST /api/web-screenshot`   | `apps/web/src/routes/api/web-screenshot.ts`   | Requires either valid user session (`auth.api.getSession`) **or** matching `x-internal-screenshot-token`; includes per-subject rate limit and SSRF protections (protocol/host/IP/allowlist checks).                                                                                                         | Active (in-repo)  | Called by `apps/web/src/components/EditorToolbar.tsx`.                                                                             |
| `POST /api/report-csp`       | `apps/web/src/routes/api/report-csp.ts`       | No auth gate; accepts CSP report payloads and logs summaries.                                                                                                                                                                                                                                               | Active (in-repo)  | Report URL configured in `apps/web/src/start.ts`; smoke test posts to it.                                                          |
| `POST /api/portal/v1/reboot` | `apps/web/src/routes/api/portal/v1/reboot.ts` | Requires bearer token (`Authorization` or `_gem_t`) validated by `validatePortalToken`; token wall-scope match check; current wall binding consistency check; optional node target validation.                                                                                                              | Active (external) | External client flow (for example control links/tokenized controller access) targets this API; no local in-repo fetch is expected. |
| `GET /proxy` (Nitro addon)   | `apps/web/src/addons/routes/proxy.ts`         | Referrer/origin allowlist gate (`PROXY_ALLOWED_REFERRERS` + host-derived defaults), optional missing-referrer policy, upstream timeout/size cap, and framing-policy pre-check (`X-Frame-Options`/CSP frame-ancestors). **Not covered by TanStack `start.ts` middleware because it is a Nitro addon route.** | Active (in-repo)  | Used by wall route iframe checks/loads in `apps/web/src/routes/wall/index.tsx`.                                                    |

## TanStack Server Function Endpoints

### `apps/web/src/server/projects.fns.ts`

| Server function endpoint      | Access-control gates observed                                                                                  | Usage status     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------- |
| `$listProjects`               | `authMiddleware` (authenticated user required).                                                                | Active (in-repo) |
| `$listPublishedProjects`      | No auth middleware (public).                                                                                   | Active (in-repo) |
| `$listKnownTags`              | `authMiddleware`.                                                                                              | Active (in-repo) |
| `$listAssets`                 | `authMiddleware`; no explicit project-membership check in handler path.                                        | Active (in-repo) |
| `$getProject`                 | `authMiddleware` + explicit owner/collaborator check in handler.                                               | Active (in-repo) |
| `$getCommit`                  | `authMiddleware` + project owner/collaborator check in handler.                                                | Active (in-repo) |
| `$createProject`              | `authMiddleware`.                                                                                              | Active (in-repo) |
| `$updateProject`              | `authMiddleware`; no explicit owner/collaborator gate in handler path.                                         | Active (in-repo) |
| `$archiveProject`             | `authMiddleware`; no explicit owner/collaborator gate in handler path.                                         | Active (in-repo) |
| `$deleteAsset`                | `authMiddleware`; no explicit owner/collaborator gate in handler path.                                         | Active (in-repo) |
| `$restoreProject`             | `authMiddleware`; no explicit owner/collaborator gate in handler path.                                         | Active (in-repo) |
| `$publishCommit`              | `authMiddleware`; no explicit owner/collaborator gate in handler path.                                         | Active (in-repo) |
| `$publishCustomRenderProject` | `authMiddleware`; no explicit owner/collaborator gate in handler path.                                         | Active (in-repo) |
| `$getAuditLogs`               | `authMiddleware`; no explicit project-membership gate in handler path.                                         | Active (in-repo) |
| `$ensureMutableHead`          | `authMiddleware`; no explicit owner/collaborator gate in handler path.                                         | Active (in-repo) |
| `$getProjectCommits`          | `authMiddleware`; no explicit project-membership gate in handler path.                                         | Active (in-repo) |
| `$createBranchHead`           | `authMiddleware`; no explicit owner/collaborator gate in handler path.                                         | Active (in-repo) |
| `$promoteBranchHead`          | `authMiddleware`; no explicit owner/collaborator gate in handler path.                                         | Active (in-repo) |
| `$copySlideInCommit`          | `authMiddleware`; no explicit actor/project membership gate in handler path.                                   | Active (in-repo) |
| `$deleteSlideFromCommit`      | `authMiddleware`; no explicit actor/project membership gate in handler path.                                   | Active (in-repo) |
| `$createUploadToken`          | `authMiddleware`.                                                                                              | Active (in-repo) |
| `$revokeUploadToken`          | `authMiddleware` + token-level authorization check (`owner/admin/token owner`) in `revokeUploadTokenForActor`. | Active (in-repo) |
| `$validateUploadToken`        | No auth middleware (token validation endpoint).                                                                | Active (in-repo) |

### `apps/web/src/server/admin.fns.ts`

All endpoints in this file use `adminMiddleware` (authenticated user with `role === 'admin'`):

- `$adminListUsers` - Active (in-repo)
- `$adminListProjects` - Active (in-repo)
- `$adminGetStats` - Active (in-repo)
- `$adminListWalls` - Active (in-repo)
- `$adminListPublicAssets` - Active (in-repo)
- `$adminDeletePublicAsset` - Active (in-repo)
- `$adminUnbindWall` - Active (in-repo)
- `$adminCreateWall` - Active (in-repo)
- `$adminGetWall` - Active (in-repo)
- `$adminUpdateWallMetadata` - Active (in-repo)
- `$adminDeleteWall` - Active (in-repo)
- `$adminGetUploadToken` - Active (in-repo)
- `$adminGetWallBindingMeta` - Active (in-repo)
- `$adminListConfig` - Active (in-repo)
- `$adminSetConfig` - Active (in-repo)
- `$adminSendSmtpTest` - Active (in-repo)
- `$adminDevicesList` - Active (in-repo)
- `$adminDevicesForWall` - Active (in-repo)
- `$adminDevicesEnrollBySignature` - Active (in-repo)

### `apps/web/src/server/walls.fns.ts`

| Server function endpoint | Access-control gates observed                    | Usage status     |
| ------------------------ | ------------------------------------------------ | ---------------- |
| `$listWalls`             | `adminMiddleware` (admin user session required). | Active (in-repo) |
| `$bindWall`              | No auth/admin middleware.                        | Active (in-repo) |

### `apps/web/src/server/portal.fns.ts`

| Server function endpoint      | Access-control gates observed                                                                          | Usage status     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------- |
| `$issueControllerPortalToken` | No auth/admin middleware; requires wall currently bound (`wallBindings` lookup) before token issuance. | Active (in-repo) |

### `apps/web/src/server/bootstrap.fns.ts`

| Server function endpoint            | Access-control gates observed                                                                          | Usage status     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------- |
| `$bootstrapStatus`                  | No auth middleware; bootstrap-state based flow control in service layer.                               | Active (in-repo) |
| `$requestBootstrapSetupCodeDisplay` | No auth middleware; bootstrap incomplete check.                                                        | Active (in-repo) |
| `$verifyBootstrapSetupCode`         | No auth middleware; setup-code hash+expiry validation.                                                 | Active (in-repo) |
| `$submitBootstrapAdminAndSmtp`      | No auth middleware; requires verified setup-code phase and validates SMTP/admin inputs + OTP dispatch. | Active (in-repo) |
| `$verifyBootstrapOtpAndFinalize`    | No auth middleware; requires pending OTP state + expiry/hash validation.                               | Active (in-repo) |
| `$finalizeFirstAdminForCurrentUser` | `freshAuthMiddleware` + bootstrap completion + email claim + "no admin exists yet" checks.             | Active (in-repo) |

## WebSocket Endpoints

| Endpoint                        | File                                      | Access-control gates observed                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Usage status     | Usage evidence                                                                                           |
| ------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| `WS /bus` (Nitro addon route)   | `apps/web/src/addons/routes/bus.ts`       | Handshake payload Zod validation (`HelloSchema`); role/specimen-based behavior (editor/wall/controller/gallery); mutation message rate-limiting + strike disconnects; bind override approval gate (editor requests can require gallery approval); some message handlers enforce specimen checks (e.g., `request_bind_wall` editor-only, `bind_override_decision` gallery-only, controller transient layer ops controller-only); device enrollment flow via `ensureDeviceByPublicKey`. | Active (in-repo) | Used by `EditorEngine`, `WallEngine`, `ControllerEngine`, `GalleryEngine` via `getWebSocketUrl('/bus')`. |
| `WS /yjs/*` (Nitro addon route) | `apps/web/src/addons/routes/yjs/[...].ts` | Path/doc-name parsing and strict scope validation (`projectId`, `commitId`, `slideId`, `layerId` format + DB layer existence); no user/session middleware gate observed.                                                                                                                                                                                                                                                                                                              | Active (in-repo) | Used by Lexical provider in `apps/web/src/components/editor/providers.ts` via `getWebSocketUrl('/yjs')`. |

## Authentication And Enrollment Modalities (Security Hardening Prep)

### Current modalities in code

User session modality:

- Used by TanStack server function middleware (`authMiddleware`, `freshAuthMiddleware`, `adminMiddleware`) via `packages/auth/src/tanstack/middleware.ts` and `_getUser` in `packages/auth/src/tanstack/functions.ts`.
- Used by REST `/api/web-screenshot` session check (`auth.api.getSession(...)`).

Device identity and enrollment modality:

- Device keys are generated client-side and stored in localStorage via `getOrCreateDeviceIdentity(...)` in `apps/web/src/lib/deviceIdentity.ts`.
- WS hello for wall/controller/gallery may send `devicePublicKey` (`HelloSchema` in `apps/web/src/lib/types.ts`).
- Server upserts/loads device by public key (`ensureDeviceByPublicKey(...)` in `apps/web/src/server/devices.ts`), initially `pending`.
- Admin enrollment flow verifies signature over `deviceId` (`adminEnrollDeviceBySignature(...)`) and marks device `active` with `assignedWallId`.
- Device enrollment QR payload (`did`, `sig`) is produced on wall/gallery/controller routes and consumed by admin wall-devices scanner.

Token modality:

- Upload token: `/api/uploads/$` and `$validateUploadToken` path.
- Portal bearer token: `/api/portal/v1/reboot` via `validatePortalToken`.

### Important observations for hardening

- WS `/bus` currently validates hello shape and specimen, but does not create a unified principal/auth context object per connection.
- Device proof-of-possession is verified at enrollment time, but not re-verified during subsequent WS hello/connect requests.
- For device hello paths, pending devices still connect and are registered (with enrollment notification), so "identified" and "authorized" are not consistently separated.
- Editor WS identity currently relies on optional `requesterEmail` sent by client hello rather than server-bound session-derived identity.

### Proposed unified auth context mechanism

Create one server-side auth context resolver and use it consistently across REST handlers, server functions, and WS connections.
Use a composite model where user/device/token credentials can coexist, each with independent verification state.

Target type (conceptual):

```ts
type CredentialState<T> =
    | { present: false }
    | { present: true; verified: false; reason: string }
    | { present: true; verified: true; value: T };

export type AuthContext = {
    transport: 'http' | 'ws';
    credentials: {
        user: CredentialState<{
            userId: string;
            email: string;
            role: 'admin' | 'user';
        }>;
        device: CredentialState<{
            deviceId: string;
            kind: 'wall' | 'gallery' | 'controller';
            status: 'pending' | 'active' | 'revoked';
            assignedWallId: string | null;
            publicKey: string;
        }>;
        token: CredentialState<{
            type: 'upload' | 'portal';
            subjectId: string;
        }>;
    };
    authModes: Array<'user' | 'device' | 'token'>; // verified only
    requestId: string;
    ip: string | null;
    userAgent: string | null;
};
```

Resolver surface (one module):

- `resolveAuthContextFromRequest(request: Request): Promise<AuthContext>`
- `authenticateWsHello(peer, helloAuth): Promise<AuthContext>` (verification first, then context)

Policy helpers (one module):

- `requireUser(ctx)`
- `requireAdmin(ctx)`
- `requireActiveDevice(ctx, kind?, wallId?)`
- `requireTokenType(ctx, tokenType)`
- `requireAny(ctx, ['user', 'device' | 'token'])`
- `requireAll(ctx, ['user', 'device' | 'token'])`

### WS-specific hardening design

For `/bus` hello, move from "shape-only hello" to "challenge + signature verification + authorization".

Signature verification must happen before trusting device identity.

Proposed flow:

1. `open`: server emits one-time challenge (`nonce`, `issuedAt`, short TTL) bound to `peer.id`.
2. client sends `hello_auth` including `specimen`, `deviceId`, `devicePublicKey`, `nonce`, `ts`, `sig`.
3. server `authenticateWsHello(...)`:
    - validates schema;
    - verifies challenge match, single-use, TTL, and replay constraints;
    - loads device record;
    - verifies device/public-key consistency;
    - verifies signature over canonical payload;
    - resolves optional user session from handshake headers.
4. server builds composite `AuthContext` and evaluates policy gates.
5. only authorized peers proceed to `registerPeer(...)`.

Policy outcomes:

- `revoked` device: reject.
- `pending` device: enrollment-only capabilities or reject (explicit policy).
- `active` device: enforce assigned-wall constraints and device kind.
- editor identity and sensitive actions should not trust client-provided `requesterEmail`; prefer server-derived session identity.

### Recommended implementation slices

1. Add `auth/context.ts` and `auth/policy.ts` in `apps/web/src/server/`.
2. Integrate context into TanStack middleware and REST handlers first (non-WS path).
3. Add WS challenge issuance and `authenticateWsHello(...)` for `/bus`, then gate `registerPeer` by policy.
4. Replace editor hello `requesterEmail` trust path with server-derived user identity where available.
5. Add audit logging fields from `AuthContext.credentials` consistently across endpoints.

### Audit impact summary

- This change does not alter endpoint inventory.
- It changes how access-control gates are evaluated internally, making user/device/token semantics explicit and composable across transports.

## Route Pipeline Coverage Notes

- apps/web/src/addons/routes/proxy.ts is outside the TanStack route tree, so it does not inherit apps/web/src/start.ts middleware.
- Follow-up action: move /proxy under apps/web/src/routes/\* so it inherits the shared request pipeline by default.

## Authentication Derivation And Device-Signing Matrix (Current Policy)

This matrix is the decision baseline to avoid re-litigating resolved points.

| Surface        | Endpoint / Call                                     | AuthContext derivation                                                                    | Device-signing policy                                                | Current status                      |
| -------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------- |
| REST route     | `POST /api/web-screenshot`                          | Upstream TanStack `start.ts` middleware (`resolveRequestAuthContext`)                     | **No** (user session only)                                           | Implemented                         |
| REST route     | `GET /proxy` (Nitro addon)                          | Direct call in route handler (`resolveRequestAuthContext`)                                | **Yes** for wall/controller/gallery callers                          | Implemented                         |
| REST callsite  | `fetch('/proxy?check=1&url=...')` from wall route   | Signed client fetch (`signedFetch`)                                                       | **Yes** (`deviceKind: 'wall'`)                                       | Implemented                         |
| REST callsite  | Asset binary downloads via `downloadAsset(...)`     | Upstream route derivation (`/api/assets/$uri`) + signed client fetch when on device pages | **Yes** on `/wall`, `/gallery`, `/controller`; no on user-only pages | Implemented                         |
| ServerFn       | `$issueControllerPortalToken`                       | Upstream `start.ts` auth context + `actorAuthContextMiddleware`                           | **Yes** when called from gallery UI                                  | Implemented                         |
| ServerFn       | `$listPublishedProjects`                            | Upstream `start.ts` auth context                                                          | **No** (user session dependent policy)                               | Pending policy is no device-signing |
| ServerFn       | `$listWalls`                                        | Upstream `start.ts` auth context + `adminMiddleware`                                      | **No** (admin user session only)                                     | Implemented                         |
| ServerFn group | `admin.fns.ts` endpoints                            | Upstream `start.ts` auth context + `adminMiddleware`                                      | **No** (admin user session only)                                     | Implemented                         |
| ServerFn group | `projects.fns.ts` editor/quarry mutations and reads | Upstream `start.ts` auth context + auth/admin middleware where applicable                 | **No** (user session driven)                                         | Implemented                         |
| ServerFn group | `bootstrap.fns.ts`                                  | Upstream `start.ts` auth context; guest/public bootstrap except finalize step             | **No**                                                               | Implemented                         |

### ServerFn `.client()` rollout stance

- `.client()` can standardize browser-side header injection for ServerFn calls where device-signing is required.
- `.client()` does **not** cover server-side execution paths (SSR/loader server execution), which must rely on server-side auth context/session.
- Current required scope is narrow and already covered without global `.client()` rollout (notably `$issueControllerPortalToken`).
