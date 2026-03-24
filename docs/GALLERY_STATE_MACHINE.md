# Gallery Card State Machine (Current Behavior)

This document captures the current runtime contract for gallery card/dialog state transitions. It reflects what is implemented today across:

- `apps/web/src/routes/gallery/index.tsx`
- `packages/ui/components/project-card.tsx`
- `packages/ui/components/morphing-dialog.tsx`

## Purpose

Gallery card behavior is driven by `/bus` events plus local user actions. The system must keep multiple connected galleries in sync while preserving local UX context where possible.

## Dialog States

- `closed`
- `expanded`
- `fullscreen`
- `minimized`

## Primary Signals and Intent

- `forceOpenSignal`
    - Source: wall binding points to a gallery project for `w=<wallId>`.
    - Intent: open/sync the targeted project card for that wall.

- `forceDemoteFullscreenSignal`
    - Source: live session start (`source=live`) for target wall.
    - Intent: demote fullscreen gallery cards to preserve context without keeping control surface active.

- `forceCloseMinimizedSignal`
    - Source: same live-session signal as above.
    - Intent: close minimized gallery cards.

- `forceCloseSignal`
    - Source: unbind/rebind sync flow for previously connected project card(s).
    - Intent: close connected cards across all gallery clients with animation.

## Transition Rules

### 1) Remote Open Arbitration (`forceOpenSignal`)

When a remote open signal targets a card:

- If current state is `expanded` or `minimized`: promote to `fullscreen`.
- If current state is `fullscreen`: remain `fullscreen`.
- If current state is `closed`:
    - open `minimized` if another card is currently `expanded`,
    - otherwise open `fullscreen`.

Design intent: avoid stealing focus from an actively inspected expanded card, but permit immediate fullscreen takeover when there is no expanded inspection context.

### 2) Live Session Start (`source=live`)

On live bind start:

- `fullscreen` cards are demoted to `expanded`.
- `minimized` cards are closed.
- `expanded` cards are unchanged.

Design intent: preserve reading context while removing active gallery control surfaces during live control.

### 3) Synced Close on Unbind/Rebind

When wall binding moves away from a gallery project:

- The previously connected project receives `forceCloseSignal`.
- `forceCloseSignal` applies to `fullscreen` and `minimized` states.
- `project-card` marks externally forced closes to avoid re-sending local unbind and creating loops.
- If previous project id is unknown due to timing/snapshot ordering, a wall-level fallback close signal is broadcast.

### 4) Local Close

When user closes a connected card:

- Card closes via animated path.
- Gallery sends unbind if the close originated from active wall-binding context.
- Bus propagation triggers synced close intent on other galleries.

## Bus-Authoritative Inputs

The behavior above depends on these server-originated events/snapshots:

- `wall_binding_changed`
- `wall_unbound`
- `gallery_state`

Current implementation assumes these are authoritative and converges UI state to them.

## Why It Is Fragile Today

Transition logic is split across route orchestration, card-level guards, and dialog internals. This creates implicit ordering dependencies and race windows around reconnect/snapshot timing/rebind churn.

## Planned Refactor (Recommended)

Migrate to one self-contained state machine with:

- explicit events (`REMOTE_OPEN`, `LIVE_STARTED`, `WALL_UNBOUND`, `WALL_REBOUND`, `LOCAL_CLOSE`)
- deterministic transition table
- explicit guards/priorities
- side effects emitted as commands (`SEND_UNBIND`, `BROADCAST_CLOSE`, `PROMOTE_FULLSCREEN`)

This is expected to reduce regressions and make behavior testable and auditable.
