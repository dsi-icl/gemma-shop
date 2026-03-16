import { db } from '@repo/db';
import type { Peer } from 'crossws';
import { ObjectId } from 'mongodb';

import { makeScopeLabel, type GSMessage, type Layer, type ScopeState } from '~/lib/types';

// All hot-path maps are keyed by a small integer
// V8 uses a faster internal representation for integer-keyed Maps.
export type ScopeId = number;

const _hmr = (process as any).__BUS_HMR__ ?? {
    scopedState: new Map<ScopeId, ScopeState>(),
    scopeKeyToId: new Map<string, ScopeId>(),
    scopeIdToKey: new Map<ScopeId, string>(),
    nextScopeId: 1
};
(process as any).__BUS_HMR__ = _hmr;

export const scopedState: Map<ScopeId, ScopeState> = _hmr.scopedState;
const scopeKeyToId: Map<string, ScopeId> = _hmr.scopeKeyToId;
const scopeIdToKey: Map<ScopeId, string> = _hmr.scopeIdToKey;

// Intern a (projectId, commitId, slideId) triple into a numeric ScopeId
export function internScope(projectId: string, commitId: string, slideId: string): ScopeId {
    const raw = makeScopeLabel(projectId, commitId, slideId);
    let id = scopeKeyToId.get(raw);
    if (id === undefined) {
        id = _hmr.nextScopeId++;
        scopeKeyToId.set(raw, id);
        scopeIdToKey.set(id, raw);
    }
    return id;
}

export function scopeLabel(id: ScopeId): string {
    return scopeIdToKey.get(id) ?? `<unknown:${id}>`;
}

export type PeerMeta =
    | { specimen: 'editor'; projectId: string; commitId: string; slideId: string; scopeId: ScopeId }
    | { specimen: 'wall'; wallId: string; col: number; row: number }
    | { specimen: 'controller'; wallId: string }
    | { specimen: 'roy' };

export interface PeerEntry {
    peer: Peer;
    meta: PeerMeta;
}

// Master peer registry: peerId → PeerEntry
export const peers = new Map<string, PeerEntry>();

// Editor scope index: scopeId → Set<PeerEntry> — direct refs, no map lookup in broadcast
export const editorsByScope = new Map<ScopeId, Set<PeerEntry>>();

// Wall peer index: wallId → Set<PeerEntry>
export const wallsByWallId = new Map<string, Set<PeerEntry>>();

// Controller index: wallId → Set<PeerEntry>
export const controllersByWallId = new Map<string, Set<PeerEntry>>();

// Flat set of every editor entry — for the __BROADCAST_EDITORS__ bridge
export const allEditors = new Set<PeerEntry>();

// wallId → ScopeId: which content a wall displays
export const wallBindings = new Map<string, ScopeId>();

// scopeId → Set<wallId>: reverse index used only for binding cleanup
export const scopeWatchers = new Map<ScopeId, Set<string>>();

/**
 * Flattened broadcast index: scopeId → Set<PeerEntry> of wall peers watching this scope.
 * Updated on bind/unbind/register/unregister (cold path) so broadcast (hot path) is one loop.
 */
export const wallPeersByScope = new Map<ScopeId, Set<PeerEntry>>();

// Active video registry for the VSYNC loop only playing videos are tracked
export const activeVideos = new Map<number, { scopeId: ScopeId; layer: Layer }>();

/** Layer → wall peers whose viewport intersects the layer AABB. Updated on upsert/bind. */
// export const layerNodes = new Map<number, Set<PeerEntry>>();

/** Running peer counts — O(1) reads instead of iterating all peers */
export const peerCounts = { editor: 0, wall: 0, controller: 0, roy: 0 };

/** Live wall node count — O(1) read from in-memory index. */
export function getWallNodeCount(wallId: string): number {
    return wallsByWallId.get(wallId)?.size ?? 0;
}

// Binary opcodes
export const OP = {
    SPATIAL_MOVE: 0x05,
    CLOCK_PING: 0x08,
    CLOCK_PONG: 0x09,
    // Reserved for future binary migration of JSON message types:
    UPSERT_LAYER: 0x10,
    DELETE_LAYER: 0x11,
    VIDEO_PLAY: 0x12,
    VIDEO_PAUSE: 0x13,
    VIDEO_SEEK: 0x14,
    VIDEO_SYNC: 0x15
} as const;

// ── Index helpers (generic over key type) ────────────────────────────────────

function addToIndex<K>(index: Map<K, Set<PeerEntry>>, key: K, entry: PeerEntry) {
    let set = index.get(key);
    if (!set) {
        set = new Set();
        index.set(key, set);
    }
    set.add(entry);
}

function removeFromIndex<K>(index: Map<K, Set<PeerEntry>>, key: K, entry: PeerEntry) {
    const set = index.get(key);
    if (set) {
        set.delete(entry);
        if (set.size === 0) index.delete(key);
    }
}

// ── Peer registration ────────────────────────────────────────────────────────

export function registerPeer(peer: Peer, meta: PeerMeta): PeerEntry {
    const entry: PeerEntry = { peer, meta };
    peers.set(peer.id, entry);

    // Seed ping timestamp for editors and walls (they run clock sync)
    if (meta.specimen === 'editor' || meta.specimen === 'wall') {
        lastPingSeen.set(peer.id, Date.now());
    }

    switch (meta.specimen) {
        case 'editor':
            addToIndex(editorsByScope, meta.scopeId, entry);
            allEditors.add(entry);
            cancelScopeCleanup(meta.scopeId);
            break;
        case 'wall': {
            addToIndex(wallsByWallId, meta.wallId, entry);
            const boundScopeId = wallBindings.get(meta.wallId);
            if (boundScopeId !== undefined) {
                addToIndex(wallPeersByScope, boundScopeId, entry);
            }
            break;
        }
        case 'controller':
            addToIndex(controllersByWallId, meta.wallId, entry);
            break;
        case 'roy':
            break;
    }

    peerCounts[meta.specimen]++;
    return entry;
}

export function unregisterPeer(peerId: string): PeerMeta | null {
    const entry = peers.get(peerId);
    if (!entry) return null;

    const { meta } = entry;
    switch (meta.specimen) {
        case 'editor':
            removeFromIndex(editorsByScope, meta.scopeId, entry);
            allEditors.delete(entry);
            scheduleScopeCleanup(meta.scopeId);
            break;
        case 'wall': {
            removeFromIndex(wallsByWallId, meta.wallId, entry);
            const boundScopeId = wallBindings.get(meta.wallId);
            if (boundScopeId !== undefined) {
                removeFromIndex(wallPeersByScope, boundScopeId, entry);
            }
            // Remove this wall peer from all layerNodes sets
            // for (const [, peerSet] of layerNodes) {
            //     peerSet.delete(entry);
            // }
            // If this was the last wall for this wallId, clean up binding
            const remainingWalls = wallsByWallId.get(meta.wallId);
            if (!remainingWalls || remainingWalls.size === 0) {
                const oldScope = wallBindings.get(meta.wallId);
                if (oldScope !== undefined) {
                    unbindWall(meta.wallId);
                    scheduleScopeCleanup(oldScope);
                }
            }
            break;
        }
        case 'controller':
            removeFromIndex(controllersByWallId, meta.wallId, entry);
            break;
        case 'roy':
            break;
    }

    peerCounts[meta.specimen]--;
    peers.delete(peerId);
    lastPingSeen.delete(peerId);
    return meta;
}

export function getOrCreateScope(
    scopeId: ScopeId,
    projectId: string,
    commitId: string,
    slideId: string
): ScopeState {
    let scope = scopedState.get(scopeId);
    if (!scope) {
        scope = {
            layers: new Map(),
            projectId,
            commitId,
            slideId,
            dirty: false,
            hydrateCache: null
        };
        scopedState.set(scopeId, scope);
    }
    return scope;
}

// Pre-allocated empty hydrate payload (avoids re-stringifying on every call).
export const EMPTY_HYDRATE: string = JSON.stringify({ type: 'hydrate', layers: [] });

export function invalidateHydrateCache(scopeId: ScopeId) {
    const scope = scopedState.get(scopeId);
    if (scope) scope.hydrateCache = null;
}

export function getHydratePayload(scopeId: ScopeId): string {
    const scope = scopedState.get(scopeId);
    if (!scope) return EMPTY_HYDRATE;
    if (!scope.hydrateCache) {
        scope.hydrateCache = JSON.stringify({
            type: 'hydrate',
            layers: Array.from(scope.layers.values())
        });
    }
    return scope.hydrateCache;
}

export function bindWall(wallId: string, scopeId: ScopeId) {
    const oldScopeId = wallBindings.get(wallId);

    // Tear down old binding
    if (oldScopeId !== undefined) {
        const watchers = scopeWatchers.get(oldScopeId);
        if (watchers) {
            watchers.delete(wallId);
            if (watchers.size === 0) scopeWatchers.delete(oldScopeId);
        }
        const wallPeers = wallsByWallId.get(wallId);
        if (wallPeers) {
            const oldSet = wallPeersByScope.get(oldScopeId);
            if (oldSet) {
                for (const entry of wallPeers) oldSet.delete(entry);
                if (oldSet.size === 0) wallPeersByScope.delete(oldScopeId);
            }
        }
        scheduleScopeCleanup(oldScopeId);
    }

    wallBindings.set(wallId, scopeId);
    cancelScopeCleanup(scopeId);

    // Wire up new binding
    let watchers = scopeWatchers.get(scopeId);
    if (!watchers) {
        watchers = new Set();
        scopeWatchers.set(scopeId, watchers);
    }
    watchers.add(wallId);

    const wallPeers = wallsByWallId.get(wallId);
    if (wallPeers) {
        let set = wallPeersByScope.get(scopeId);
        if (!set) {
            set = new Set();
            wallPeersByScope.set(scopeId, set);
        }
        for (const entry of wallPeers) set.add(entry);
    }
}

export function unbindWall(wallId: string) {
    const oldScopeId = wallBindings.get(wallId);
    if (oldScopeId !== undefined) {
        const watchers = scopeWatchers.get(oldScopeId);
        if (watchers) {
            watchers.delete(wallId);
            if (watchers.size === 0) scopeWatchers.delete(oldScopeId);
        }
        const wallPeers = wallsByWallId.get(wallId);
        if (wallPeers) {
            const set = wallPeersByScope.get(oldScopeId);
            if (set) {
                for (const entry of wallPeers) set.delete(entry);
                if (set.size === 0) wallPeersByScope.delete(oldScopeId);
            }
        }
        scheduleScopeCleanup(oldScopeId);
    }
    wallBindings.delete(wallId);
}

const BACKPRESSURE_THRESHOLD = 65536; // 64KB

// Returns false if the peer's send buffer is congested (to skip non-critical sends)
export function canSendNonCritical(peer: Peer): boolean {
    try {
        const buffered = (peer.websocket as any)?.bufferedAmount;
        return typeof buffered !== 'number' || buffered < BACKPRESSURE_THRESHOLD;
    } catch {
        return true;
    }
}

export function sendJSON(peer: Peer, data: GSMessage) {
    peer.send(JSON.stringify(data));
}

export function broadcastToEditorsRaw(scopeId: ScopeId, payload: string, exclude?: PeerEntry) {
    const set = editorsByScope.get(scopeId);
    if (!set) return;
    for (const entry of set) {
        if (entry !== exclude) entry.peer.send(payload);
    }
}

export function broadcastToEditors(scopeId: ScopeId, data: GSMessage, exclude?: PeerEntry) {
    broadcastToEditorsRaw(scopeId, JSON.stringify(data), exclude);
}

export function broadcastToWallsRaw(scopeId: ScopeId, payload: string) {
    const set = wallPeersByScope.get(scopeId);
    if (!set) return;
    for (const entry of set) entry.peer.send(payload);
}

export function broadcastToWalls(scopeId: ScopeId, data: GSMessage) {
    broadcastToWallsRaw(scopeId, JSON.stringify(data));
}

export function broadcastToWallsBinary(scopeId: ScopeId, data: ArrayBuffer) {
    const set = wallPeersByScope.get(scopeId);
    if (!set) return;
    for (const entry of set) {
        if (canSendNonCritical(entry.peer)) entry.peer.send(data);
    }
}

export function broadcastToScopeRaw(scopeId: ScopeId, payload: string, exclude?: PeerEntry) {
    broadcastToEditorsRaw(scopeId, payload, exclude);
    broadcastToWallsRaw(scopeId, payload);
}

export function broadcastToScope(scopeId: ScopeId, data: GSMessage, exclude?: PeerEntry) {
    const payload = JSON.stringify(data);
    broadcastToEditorsRaw(scopeId, payload, exclude);
    broadcastToWallsRaw(scopeId, payload);
}

// Hydrate all wall peers for a given wallId with their bound scope's layers
export function hydrateWallNodes(wallId: string) {
    const scopeId = wallBindings.get(wallId);
    const payload = scopeId !== undefined ? getHydratePayload(scopeId) : EMPTY_HYDRATE;

    const wallPeers = wallsByWallId.get(wallId);
    if (!wallPeers) return;
    for (const entry of wallPeers) entry.peer.send(payload);
}

// Notify all controllers for a wallId about binding status
export function notifyControllers(
    wallId: string,
    bound: boolean,
    projectId?: string,
    commitId?: string,
    slideId?: string
) {
    const entries = controllersByWallId.get(wallId);
    if (!entries) return;

    const payload = JSON.stringify({
        type: 'wall_binding_status',
        wallId,
        bound,
        ...(projectId ? { projectId } : {}),
        ...(commitId ? { commitId } : {}),
        ...(slideId ? { slideId } : {})
    } satisfies GSMessage);

    for (const entry of entries) entry.peer.send(payload);
}

// Track a video as actively playing (called from video_play handler)
export function registerActiveVideo(numericId: number, scopeId: ScopeId, layer: Layer) {
    activeVideos.set(numericId, { scopeId, layer });
}

export function unregisterActiveVideo(numericId: number) {
    activeVideos.delete(numericId);
}

export function clearActiveVideosForScope(scopeId: ScopeId) {
    for (const [numericId, entry] of activeVideos) {
        if (entry.scopeId === scopeId) activeVideos.delete(numericId);
    }
}

// const NODE_W = 1920;
// const NODE_H = 1080;

// function layerIntersectsNode(layer: Layer, col: number, row: number): boolean {
//     const { cx, cy, width, height, scaleX, scaleY } = layer.config;
//     const hw = (width * Math.abs(scaleX)) / 2;
//     const hh = (height * Math.abs(scaleY)) / 2;

//     const nx = col * NODE_W;
//     const ny = row * NODE_H;

//     return cx - hw < nx + NODE_W && cx + hw > nx && cy - hh < ny + NODE_H && cy + hh > ny;
// }

// /** Recompute which wall peers intersect a single layer. */
// export function recomputeLayerNodes(numericId: number, layer: Layer, scopeId: ScopeId) {
//     const wallPeers = wallPeersByScope.get(scopeId);
//     if (!wallPeers || wallPeers.size === 0) {
//         layerNodes.delete(numericId);
//         return;
//     }
//     const matching = new Set<PeerEntry>();
//     for (const entry of wallPeers) {
//         if (entry.meta.specimen === 'wall' && layerIntersectsNode(layer, entry.meta.col, entry.meta.row)) {
//             matching.add(entry);
//         }
//     }
//     if (matching.size > 0) layerNodes.set(numericId, matching);
//     else layerNodes.delete(numericId);
// }

// /** Recompute layer-node index for all layers in a scope. */
// export function recomputeAllLayerNodes(scopeId: ScopeId) {
//     const scope = scopedState.get(scopeId);
//     if (!scope) return;
//     for (const [numericId, layer] of scope.layers) {
//         recomputeLayerNodes(numericId, layer, scopeId);
//     }
// }

// /** Delete a single layer from the node index. */
// export function deleteLayerNodes(numericId: number) {
//     layerNodes.delete(numericId);
// }

// /** Clear all layer-node entries for a scope. */
// export function clearLayerNodesForScope(scopeId: ScopeId) {
//     const scope = scopedState.get(scopeId);
//     if (!scope) return;
//     for (const numericId of scope.layers.keys()) {
//         layerNodes.delete(numericId);
//     }
// }

// Send video_sync to editors (JSON) + intersecting walls (binary, single entry)
export function sendVideoSyncToRelevantWalls(
    numericId: number,
    scopeId: ScopeId,
    playback: { status: 'playing' | 'paused'; anchorMediaTime: number; anchorServerTime: number }
) {
    // Editors: JSON (few clients, need it for UI)
    broadcastToEditorsRaw(scopeId, JSON.stringify({ type: 'video_sync', numericId, playback }));

    // Walls: binary (count=1)
    const frame = encodeVideoSyncBinary([
        {
            numericId,
            status: playback.status,
            anchorMediaTime: playback.anchorMediaTime,
            anchorServerTime: playback.anchorServerTime
        }
    ]);

    const targets = wallPeersByScope.get(scopeId);
    // const targets = layerNodes.get(numericId) ?? wallPeersByScope.get(scopeId);
    if (targets) {
        for (const entry of targets) {
            if (canSendNonCritical(entry.peer)) entry.peer.send(frame);
        }
    }
}
// VSYNC batch: for each wall peer, collect all intersecting active videos,  encode into a single binary VIDEO_SYNC frame, and send
export function broadcastVideoSyncBatchToWalls(
    videos: Array<{
        numericId: number;
        scopeId: ScopeId;
        playback: {
            status: 'playing' | 'paused';
            anchorMediaTime: number;
            anchorServerTime: number;
        };
    }>
) {
    // Send JSON to editors
    for (const v of videos) {
        broadcastToEditorsRaw(
            v.scopeId,
            JSON.stringify({ type: 'video_sync', numericId: v.numericId, playback: v.playback })
        );
    }

    // Per-peer entry lists
    const peerBatches = new Map<
        PeerEntry,
        Array<{
            numericId: number;
            status: 'playing' | 'paused';
            anchorMediaTime: number;
            anchorServerTime: number;
        }>
    >();

    for (const v of videos) {
        const entry = {
            numericId: v.numericId,
            status: v.playback.status,
            anchorMediaTime: v.playback.anchorMediaTime,
            anchorServerTime: v.playback.anchorServerTime
        };

        const targets = wallPeersByScope.get(v.scopeId);
        // const targets = layerNodes.get(v.numericId) ?? wallPeersByScope.get(v.scopeId);
        if (!targets) continue;

        for (const pe of targets) {
            if (!canSendNonCritical(pe.peer)) continue;
            let list = peerBatches.get(pe);
            if (!list) {
                list = [];
                peerBatches.set(pe, list);
            }
            list.push(entry);
        }
    }

    // Encode and send one binary frame per peer
    for (const [pe, entries] of peerBatches) {
        pe.peer.send(encodeVideoSyncBinary(entries));
    }
}

// Encode video sync entries into binary VIDEO_SYNC frame.
// Format: opcode(u8) + count(u16) + [numericId(u16) + status(u8) + anchorMediaTime(f64) + anchorServerTime(f64)]...
export function encodeVideoSyncBinary(
    entries: Array<{
        numericId: number;
        status: 'playing' | 'paused';
        anchorMediaTime: number;
        anchorServerTime: number;
    }>
): ArrayBuffer {
    const buf = new ArrayBuffer(3 + entries.length * 19);
    const view = new DataView(buf);
    view.setUint8(0, 0x15); // VIDEO_SYNC opcode
    view.setUint16(1, entries.length, true);
    let offset = 3;
    for (const e of entries) {
        view.setUint16(offset, e.numericId, true);
        view.setUint8(offset + 2, e.status === 'playing' ? 1 : 0);
        view.setFloat64(offset + 3, e.anchorMediaTime, true);
        view.setFloat64(offset + 11, e.anchorServerTime, true);
        offset += 19;
    }
    return buf;
}

const SCOPE_CLEANUP_GRACE_MS = 5 * 60 * 1000; // 5 minutes
const scopeCleanupTimers = new Map<ScopeId, ReturnType<typeof setTimeout>>();

// Garbage collection if no editors or walls are watching a scope
export function scheduleScopeCleanup(scopeId: ScopeId) {
    // Don't schedule if there are still editors or walls in this scope
    const editors = editorsByScope.get(scopeId);
    if (editors && editors.size > 0) return;
    const watchers = scopeWatchers.get(scopeId);
    if (watchers && watchers.size > 0) return;

    // Don't double-schedule
    if (scopeCleanupTimers.has(scopeId)) return;

    console.log(
        `[Bus] Scheduling scope cleanup for ${scopeLabel(scopeId)} in ${SCOPE_CLEANUP_GRACE_MS / 1000}s`
    );
    const timer = setTimeout(() => {
        scopeCleanupTimers.delete(scopeId);
        executeScopeCleanup(scopeId);
    }, SCOPE_CLEANUP_GRACE_MS);
    scopeCleanupTimers.set(scopeId, timer);
}

/** Cancel a pending scope cleanup (called when an editor joins or a wall binds). */
export function cancelScopeCleanup(scopeId: ScopeId) {
    const timer = scopeCleanupTimers.get(scopeId);
    if (timer) {
        clearTimeout(timer);
        scopeCleanupTimers.delete(scopeId);
        console.log(`[Bus] Cancelled scope cleanup for ${scopeLabel(scopeId)}`);
    }
}

/** Execute scope garbage collection: auto-save if dirty, then purge all state. */
async function executeScopeCleanup(scopeId: ScopeId) {
    const scope = scopedState.get(scopeId);
    if (!scope) return;

    // Re-check: someone may have reconnected during the grace period
    const editors = editorsByScope.get(scopeId);
    if (editors && editors.size > 0) return;
    const watchers = scopeWatchers.get(scopeId);
    if (watchers && watchers.size > 0) return;

    console.log(`[Bus] Cleaning up scope ${scopeLabel(scopeId)}`);

    // Auto-save if dirty
    if (scope.dirty) {
        await saveScope(scopeId, 'Auto-save before scope cleanup', true);
    }

    // Purge layer-node entries
    // clearLayerNodesForScope(scopeId);

    // Purge active videos
    clearActiveVideosForScope(scopeId);

    // Purge scope state
    scopedState.delete(scopeId);

    // Purge interning maps
    const key = scopeIdToKey.get(scopeId);
    if (key) {
        scopeKeyToId.delete(key);
        scopeIdToKey.delete(scopeId);
    }

    // Purge broadcast indexes (should already be empty, but ensure)
    editorsByScope.delete(scopeId);
    wallPeersByScope.delete(scopeId);
    scopeWatchers.delete(scopeId);
}

// Resolve the ScopeId for a peer (editors directly, walls/controllers via binding)
export function resolveScopeId(meta: PeerMeta): ScopeId | null {
    switch (meta.specimen) {
        case 'editor':
            return meta.scopeId;
        case 'wall':
        case 'controller':
            return wallBindings.get(meta.wallId) ?? null;
        default:
            return null;
    }
}

const PING_TIMEOUT_MS = 15_000; // Force-close peers with no ping for 15s

// Last clock-ping timestamp per peer. Updated in handleBinary CLOCK_PING handler
export const lastPingSeen = new Map<string, number>();

// Mark a peer as having pinged
export function touchPing(peerId: string) {
    lastPingSeen.set(peerId, Date.now());
}

// Reap zombie peers: force-close any peer that hasn't pinged in PING_TIMEOUT_MS.
// Controllers are exempt (they don't run clock sync)
export function reapStalePeers(): number {
    const now = Date.now();
    let reaped = 0;
    for (const [peerId, lastSeen] of lastPingSeen) {
        if (now - lastSeen > PING_TIMEOUT_MS) {
            const entry = peers.get(peerId);
            if (entry) {
                console.log(
                    `[Bus] Reaping stale peer ${peerId} (${entry.meta.specimen}, last ping ${Math.round((now - lastSeen) / 1000)}s ago)`
                );
                try {
                    entry.peer.close();
                } catch {
                    // Already closed
                }
                // unregisterPeer will be called by the close handler
            }
            lastPingSeen.delete(peerId);
            reaped++;
        }
    }
    return reaped;
}

export function logPeerCounts() {
    console.log(
        `[WS] Peers: ${peerCounts.editor} editors, ${peerCounts.wall} walls, ` +
            `${peerCounts.controller} controllers, ${peerCounts.roy} roys`
    );
}

/**
 * Auto-seed a scope from the DB commit when the scope is freshly created (empty).
 * Fetches the commit, finds the matching slide, and populates scope.layers.
 */
export async function seedScopeFromDb(scopeId: ScopeId): Promise<boolean> {
    const scope = scopedState.get(scopeId);
    if (!scope || scope.layers.size > 0) return false;

    try {
        const commit = await db
            .collection('commits')
            .findOne({ _id: new ObjectId(scope.commitId) });
        if (!commit?.content?.slides) return false;

        const slide = (commit.content.slides as Array<{ id: string; layers: any[] }>).find(
            (s) => s.id === scope.slideId
        );
        if (!slide?.layers?.length) return false;

        for (const layer of slide.layers) {
            if (typeof layer?.numericId === 'number') {
                scope.layers.set(layer.numericId, layer);
            }
        }
        scope.dirty = false;
        invalidateHydrateCache(scopeId);
        return true;
    } catch (err) {
        console.error(`[Bus] seedScopeFromDb failed for ${scopeLabel(scopeId)}:`, err);
        return false;
    }
}

// DB snapshoting
export async function buildSlidesSnapshot(
    scope: ScopeState,
    headCommitId: ObjectId | string | null
): Promise<Array<{ id: string; order: number; layers: Layer[] }>> {
    let existingSlides: Array<{ id: string; order: number; layers: Layer[] }> = [];

    if (headCommitId) {
        const headCommit = await db
            .collection('commits')
            .findOne({ _id: new ObjectId(headCommitId) });
        if (headCommit?.content?.slides) {
            existingSlides = headCommit.content.slides;
        }
    }

    const currentLayers = Array.from(scope.layers.values());
    let slideFound = false;
    const updatedSlides = existingSlides.map((slide) => {
        if (slide.id === scope.slideId) {
            slideFound = true;
            return { ...slide, layers: currentLayers };
        }
        return slide;
    });

    if (!slideFound) {
        updatedSlides.push({
            id: scope.slideId,
            order: updatedSlides.length,
            layers: currentLayers
        });
    }

    return updatedSlides;
}

export async function saveScope(
    scopeId: ScopeId,
    message: string,
    isAutoSave: boolean
): Promise<{ success: boolean; commitId?: string; error?: string }> {
    const scope = scopedState.get(scopeId);
    if (!scope) return { success: false, error: 'Scope not found' };

    const projectId = new ObjectId(scope.projectId);

    try {
        // Resolve the mutable HEAD commit ID — prefer scope.commitId, fall back to project lookup
        let headId: ObjectId;
        if (scope.commitId) {
            headId = new ObjectId(scope.commitId);
        } else {
            const project = await db.collection('projects').findOne({ _id: projectId });
            if (!project?.headCommitId) return { success: false, error: 'No HEAD commit' };
            headId = new ObjectId(project.headCommitId);
        }

        const updatedSlides = await buildSlidesSnapshot(scope, headId);

        if (isAutoSave) {
            // Update the mutable HEAD in place
            await db.collection('commits').updateOne(
                { _id: headId },
                {
                    $set: {
                        message,
                        content: { slides: updatedSlides },
                        updatedAt: new Date()
                    }
                }
            );

            scope.dirty = false;
            return { success: true };
        }

        // Manual save: create immutable snapshot, then pointer-swap HEAD's parentId
        const snapshot = {
            projectId,
            parentId: null as ObjectId | null,
            authorId: new ObjectId(), // TODO: session user
            message,
            content: { slides: updatedSlides },
            isAutoSave: false,
            isMutableHead: false,
            createdAt: new Date()
        };

        // Preserve HEAD's current parentId chain on the snapshot
        const currentHead = await db.collection('commits').findOne({ _id: headId });
        if (currentHead?.parentId) {
            snapshot.parentId = new ObjectId(currentHead.parentId);
        }

        const result = await db.collection('commits').insertOne(snapshot);

        // Pointer swap: HEAD now points at the snapshot
        await db
            .collection('commits')
            .updateOne({ _id: headId }, { $set: { parentId: result.insertedId } });

        scope.dirty = false;
        return { success: true, commitId: result.insertedId.toHexString() };
    } catch (err) {
        console.error(`[Bus] saveScope failed for ${scopeLabel(scopeId)}:`, err);
        return { success: false, error: String(err) };
    }
}
