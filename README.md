# Gemma Shop

Collaborative, multi-tenant presentation system for large video walls.

Gemma Shop lets multiple users edit decks in real time and publish synchronized output to distributed wall nodes. The platform is optimized for low-latency editing, fast wall playback, and commit-based versioning.

## Architecture Docs

- [Architecture Overview](./docs/ARCHITECTURE_OVERVIEW.md): high-level system structure, ownership boundaries, and onboarding path.
- [Realtime Protocol](./docs/REALTIME_PROTOCOL.md): `/bus` and `/yjs` transport/message semantics.
- [Bus Piping](./docs/BUS_PIPING.md): detailed topology for the realtime bus, scope model, YJS co-bus integration, and naming/refactor proposals.
- [README.md](./README.md): high-level project overview and contributor onboarding.

## What It Does

- Real-time collaborative editing of slide-based decks
- Multi-endpoint runtime with specialized clients:
    - `editor`: authoring UI
    - `wall`: render node
    - `controller`: wall binding/orchestration
    - `roy`: specialized graph/telemetry client
- Commit graph with mutable head + immutable snapshot history
- Asset pipeline for image/video upload, processing, and live broadcast to editors

## Tech Stack

- [Turborepo](https://turborepo.com/) + [bun](https://bun.sh/)
- [React 19](https://react.dev) + [React Compiler](https://react.dev/learn/react-compiler)
- TanStack [Start](https://tanstack.com/start/latest) + [Router](https://tanstack.com/router/latest) + [Query](https://tanstack.com/query/latest) + [Form](https://tanstack.com/form/latest)
- [Vite 8](https://vite.dev/) + [Nitro v3](https://v3.nitro.build/)
- [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) + [Base UI](https://base-ui.com/) (base-maia)
- [MongoDB](https://www.mongodb.com/)
- [Better Auth](https://www.better-auth.com/)
- [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) + [Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html)

## Repository Layout

```sh
├── apps
│    ├── web                    # TanStack Start web app + Nitro websocket routes
├── packages
│    ├── auth                   # Better Auth
│    ├── db                     # MongoDB
│    ├── emails                 # Template for emails
│    └── ui                     # shadcn/ui primitives & utils
├── tooling
│    └── tsconfig               # Shared TypeScript configuration
├── turbo.json
├── LICENSE
└── README.md
```

## Core Runtime Architecture

### 1) WebSocket Bus (`apps/web/src/addons/routes/bus.ts` + `apps/web/src/lib/busState.ts`)

- Tracks peers by role (`editor`, `wall`, `controller`, `roy`)
- Interns `(projectId, commitId, slideId)` into numeric `ScopeId`
- Maintains in-memory scope layer state for fast relay/hydrate
- Runs periodic loops:
    - VSYNC sync loop for active videos
    - Autosave loop for dirty scopes
    - Stale-peer reaper loop
- Broadcast bridges:
    - `__BROADCAST_EDITORS__` for processing progress
    - `__BROADCAST_ASSET_ADDED__` for newly created assets

For full flow maps (bind/unbind, hydrate, scope internals, YJS bridge path), see [PIPING](./docs/PIPING.md).

### 2) Editor State (`apps/web/src/lib/editorStore.ts`)

- Zustand store for layers, slides, selection, and tool state
- Handles optimistic updates and server synchronization
- Uses throttled layer update sends to reduce network chatter

### 3) Upload Pipeline (`apps/web/src/routes/api/uploads/$.ts`)

- Tus upload ingestion
- Media type detection and post-processing
- Image path:
    - Copy original
    - Blurhash compute
    - WebP size variant generation
- Video path:
    - FFmpeg transcode to MP4
    - Preview frame extraction
    - Blurhash + variant generation from preview
- Inserts asset metadata and broadcasts to active editors

### 4) Persistence and Versioning

- Projects, commits, assets in MongoDB
- Mutable HEAD commit used for active editing/autosave
- Manual save creates immutable snapshot and advances chain pointer
- Slide metadata updates persist independently from layer payloads

## Data Model Notes

- `projects`: ownership/collaborators, `headCommitId`, `publishedCommitId`
- `commits`: graph nodes with `parentId`, `content.slides[*].layers`
- `assets`: media metadata, URLs, preview/blurhash, variants, visibility

## Local Development

### Prerequisites

- Bun
- MongoDB replica set
- Environment variables configured in `.env`

### Commands

- Install deps: `bun install`
- Run all dev targets: `bun run dev`
- Run web only: `bun run dev:web`
- Lint: `bun run lint`
- Format: `bun run format`
- Quality checks: `bun run check`

## Main application entry points

- `/gallery` project listing
- `/quarry` project management
- `/quarry/editor` editor flow
- `/wall` wall node endpoint (query params `c`, `r`, `w`)

## Operational Invariants

- Scope identity is `(projectId, commitId, slideId)` and must remain stable
- Bus cleanup must not delete active scopes (editors/walls present)
- Video sync timestamps are authoritative server-side once playback starts
- Autosave only updates mutable HEAD context

## Text Rendering Model

- Text styling is authored in Lexical HTML and rendered through both:
    - editor DOM,
    - canvas via SVG `foreignObject`,
    - wall DOM renderer.
- Baseline text context (font family, base font size, line-height, padding) is centralized in `apps/web/src/lib/textRenderConfig.ts` and reused by all renderers to avoid drift.
- Font size in toolbar is displayed as virtual `px` for UX, but stored as `em` in inline styles for scale-safe persistence.
- Canonical text scale for font-size conversion uses `scaleY` by design. Alternative considered: isotropic average `sqrt(scaleX * scaleY)`.

## Known Technical Debt (Current)

- High complexity hotspots:
    - `EditorSlate`
    - `Toolbar`
    - upload route `onUploadFinish`
    - upload route `detectMediaType`

### Known issues

- While a controller is bound to a wall under active editor live broadcast, controller slide state can drift from scope reality; `slides_updated` metadata events are now partially reconciled client-side, but structural slide changes still require full commit refetch and can momentarily desync.

## Development considerations

### Safe Order for Refactors

1. Pure performance internals with no API changes
2. Dead code removal guarded by lint/tests
3. Component decomposition and behavior-preserving rewrites
4. Optional protocol/index optimizations

### Do-Not-Break Checklist

- Wall hydration on bind/unbind
- Active video sync consistency
- Autosave and manual save semantics
- Asset creation + editor broadcast
- Commit history and branch promotion flows

### Suggested Validation After any Changes

- Lint + type checks
- Upload image/video and verify asset records
- Multi-editor sync test on same scope
- Wall bind/unbind + hydrate verification
- Manual save + publish/unpublish regression pass

## License

[MIT](./LICENSE)
