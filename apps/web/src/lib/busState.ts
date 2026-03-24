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
    commitToScopeIds: new Map<string, Set<ScopeId>>(),
    nextScopeId: 1,
    peers: new Map<string, PeerEntry>(),
    editorsByScope: new Map<ScopeId, Set<PeerEntry>>(),
    wallsByWallId: new Map<string, Set<PeerEntry>>(),
    controllersByWallId: new Map<string, Set<PeerEntry>>(),
    galleriesByWallId: new Map<string, Set<PeerEntry>>(),
    allGalleries: new Set<PeerEntry>(),
    allEditors: new Set<PeerEntry>(),
    wallBindings: new Map<string, ScopeId>(),
    wallBindingSources: new Map<string, 'live' | 'gallery'>(),
    scopeWatchers: new Map<ScopeId, Set<string>>(),
    wallPeersByScope: new Map<ScopeId, Set<PeerEntry>>(),
    activeVideos: new Map<number, { scopeId: ScopeId; layer: Layer }>(),
    peerCounts: { editor: 0, wall: 0, controller: 0, gallery: 0, roy: 0 },
    lastPingSeen: new Map<string, number>(),
    scopeCleanupTimers: new Map<ScopeId, ReturnType<typeof setTimeout>>(),
    wallUnbindTimers: new Map<string, ReturnType<typeof setTimeout>>(),
    controllerTransientByWallId: new Map<string, Map<number, Layer>>()
};
if (!_hmr.controllerTransientByWallId) {
    _hmr.controllerTransientByWallId = new Map<string, Map<number, Layer>>();
}
if (!_hmr.galleriesByWallId) {
    _hmr.galleriesByWallId = new Map<string, Set<PeerEntry>>();
}
if (!_hmr.allGalleries) {
    _hmr.allGalleries = new Set<PeerEntry>();
}
if (!_hmr.wallUnbindTimers) {
    _hmr.wallUnbindTimers = new Map<string, ReturnType<typeof setTimeout>>();
}
if (typeof _hmr.peerCounts.gallery !== 'number') {
    _hmr.peerCounts.gallery = 0;
}
(process as any).__BUS_HMR__ = _hmr;

export const scopedState: Map<ScopeId, ScopeState> = _hmr.scopedState;
const scopeKeyToId: Map<string, ScopeId> = _hmr.scopeKeyToId;
const scopeIdToKey: Map<ScopeId, string> = _hmr.scopeIdToKey;
const commitToScopeIds: Map<string, Set<ScopeId>> = _hmr.commitToScopeIds;

const _telemetry = (process as any).__BUS_TELEMETRY__ ?? {
    incomingJson: 0,
    incomingBinary: 0,
    outgoingJson: 0,
    outgoingBinary: 0,
    videoSyncFrames: 0,
    videoSyncEntries: 0,
    startedAt: Date.now()
};
(process as any).__BUS_TELEMETRY__ = _telemetry;

function markOutgoing(jsonRecipients: number, binaryRecipients: number) {
    if (jsonRecipients > 0) _telemetry.outgoingJson += jsonRecipients;
    if (binaryRecipients > 0) _telemetry.outgoingBinary += binaryRecipients;
}

export function markIncomingJson() {
    _telemetry.incomingJson += 1;
}

export function markIncomingBinary() {
    _telemetry.incomingBinary += 1;
}

export function getBusRuntimeTelemetry() {
    let dirtyScopes = 0;
    let layerCount = 0;
    for (const scope of scopedState.values()) {
        if (scope.dirty) dirtyScopes += 1;
        layerCount += scope.layers.size;
    }

    return {
        incomingJson: _telemetry.incomingJson,
        incomingBinary: _telemetry.incomingBinary,
        outgoingJson: _telemetry.outgoingJson,
        outgoingBinary: _telemetry.outgoingBinary,
        videoSyncFrames: _telemetry.videoSyncFrames,
        videoSyncEntries: _telemetry.videoSyncEntries,
        activeVideos: activeVideos.size,
        scopes: scopedState.size,
        dirtyScopes,
        layers: layerCount,
        startedAt: _telemetry.startedAt
    };
}

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
    | {
          specimen: 'editor';
          projectId: string;
          commitId: string;
          slideId: string;
          scopeId: ScopeId;
          requesterEmail?: string;
      }
    | { specimen: 'wall'; wallId: string; col: number; row: number }
    | { specimen: 'controller'; wallId: string }
    | { specimen: 'gallery'; wallId?: string }
    | { specimen: 'roy' };

export interface PeerEntry {
    peer: Peer;
    meta: PeerMeta;
}

// Master peer registry: peerId → PeerEntry
export const peers: Map<string, PeerEntry> = _hmr.peers;

// Editor scope index: scopeId → Set<PeerEntry> — direct refs, no map lookup in broadcast
export const editorsByScope: Map<ScopeId, Set<PeerEntry>> = _hmr.editorsByScope;

// Wall peer index: wallId → Set<PeerEntry>
export const wallsByWallId: Map<string, Set<PeerEntry>> = _hmr.wallsByWallId;

// Controller index: wallId → Set<PeerEntry>
export const controllersByWallId: Map<string, Set<PeerEntry>> = _hmr.controllersByWallId;

// Gallery watcher index: wallId → Set<PeerEntry>
export const galleriesByWallId: Map<string, Set<PeerEntry>> = _hmr.galleriesByWallId;

// Flat set of every gallery entry
export const allGalleries: Set<PeerEntry> = _hmr.allGalleries;

// Flat set of every editor entry — for the __BROADCAST_EDITORS__ bridge
export const allEditors: Set<PeerEntry> = _hmr.allEditors;

// wallId → ScopeId: which content a wall displays
export const wallBindings: Map<string, ScopeId> = _hmr.wallBindings;
export const wallBindingSources: Map<string, 'live' | 'gallery'> = _hmr.wallBindingSources;

// scopeId → Set<wallId>: reverse index used only for binding cleanup
export const scopeWatchers: Map<ScopeId, Set<string>> = _hmr.scopeWatchers;

/**
 * Flattened broadcast index: scopeId → Set<PeerEntry> of wall peers watching this scope.
 * Updated on bind/unbind/register/unregister (cold path) so broadcast (hot path) is one loop.
 */
export const wallPeersByScope: Map<ScopeId, Set<PeerEntry>> = _hmr.wallPeersByScope;
export const controllerTransientByWallId: Map<
    string,
    Map<number, Layer>
> = _hmr.controllerTransientByWallId;

// Active video registry for the VSYNC loop only playing videos are tracked
export const activeVideos: Map<number, { scopeId: ScopeId; layer: Layer }> = _hmr.activeVideos;

/** Layer → wall peers whose viewport intersects the layer AABB. Updated on upsert/bind. */
// export const layerNodes = new Map<number, Set<PeerEntry>>();

/** Running peer counts — O(1) reads instead of iterating all peers */
export const peerCounts: {
    editor: number;
    wall: number;
    controller: number;
    gallery: number;
    roy: number;
} = _hmr.peerCounts;

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
            cancelWallUnbindGrace(meta.wallId);
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
        case 'gallery':
            allGalleries.add(entry);
            if (meta.wallId) addToIndex(galleriesByWallId, meta.wallId, entry);
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
            break;
        }
        case 'controller':
            removeFromIndex(controllersByWallId, meta.wallId, entry);
            break;
        case 'gallery':
            allGalleries.delete(entry);
            if (meta.wallId) removeFromIndex(galleriesByWallId, meta.wallId, entry);
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
    slideId: string,
    customRenderUrl?: string,
    customRenderCompat?: boolean,
    customRenderProxy?: boolean
): ScopeState {
    let scope = scopedState.get(scopeId);
    if (!scope) {
        scope = {
            layers: new Map(),
            projectId,
            commitId,
            slideId,
            dirty: false,
            hydrateCache: null,
            customRenderUrl,
            customRenderCompat: customRenderCompat ?? false,
            customRenderProxy: customRenderProxy ?? false
        };
        scopedState.set(scopeId, scope);

        let scopeIds = commitToScopeIds.get(commitId);
        if (!scopeIds) {
            scopeIds = new Set();
            commitToScopeIds.set(commitId, scopeIds);
        }
        scopeIds.add(scopeId);
    } else {
        let changed = false;
        if (customRenderUrl !== undefined && scope.customRenderUrl !== customRenderUrl) {
            scope.customRenderUrl = customRenderUrl;
            changed = true;
        }
        if (customRenderCompat !== undefined && scope.customRenderCompat !== customRenderCompat) {
            scope.customRenderCompat = customRenderCompat;
            changed = true;
        }
        if (customRenderProxy !== undefined && scope.customRenderProxy !== customRenderProxy) {
            scope.customRenderProxy = customRenderProxy;
            changed = true;
        }
        if (changed) scope.hydrateCache = null;
    }
    return scope;
}

export function deleteYDocForLayer(scopeId: ScopeId, numericId: number) {
    const scope = scopedState.get(scopeId);
    if (!scope) return;

    const ydocScope = `${scope.projectId}_${scope.commitId}_${scope.slideId}_${numericId}`;
    void db
        .collection('ydocs')
        .deleteOne({ scope: ydocScope })
        .catch((err) => {
            console.error(`[Bus] Failed to delete ydoc for ${ydocScope}:`, err);
        });
}

// Pre-allocated empty hydrate payload (avoids re-stringifying on every call).
export const EMPTY_HYDRATE: string = JSON.stringify({ type: 'hydrate', layers: [] });

export function invalidateHydrateCache(scopeId: ScopeId) {
    const scope = scopedState.get(scopeId);
    if (scope) scope.hydrateCache = null;
}

export function invalidateWallHydrateCache(_scopeId: ScopeId) {
    // no-op: wall hydrate payloads are generated per wall, on demand
}

export function getEditorHydratePayload(scopeId: ScopeId): string {
    const scope = scopedState.get(scopeId);
    if (!scope) return EMPTY_HYDRATE;
    if (!scope.hydrateCache) {
        scope.hydrateCache = JSON.stringify({
            type: 'hydrate',
            layers: Array.from(scope.layers.values()),
            ...(scope.customRenderUrl
                ? {
                      customRender: {
                          url: scope.customRenderUrl,
                          compat: Boolean(scope.customRenderCompat),
                          proxy: Boolean(scope.customRenderProxy)
                      }
                  }
                : {})
        });
    }
    return scope.hydrateCache;
}

export function getWallHydratePayload(scopeId: ScopeId, wallId: string): string {
    const scope = scopedState.get(scopeId);
    if (!scope) return EMPTY_HYDRATE;
    const boundSource = wallBindingSources.get(wallId);

    const controllerTransient = controllerTransientByWallId.get(wallId);
    if (!controllerTransient || controllerTransient.size === 0) {
        return JSON.stringify({
            type: 'hydrate',
            layers: Array.from(scope.layers.values()),
            ...(scope.customRenderUrl
                ? {
                      customRender: {
                          url: scope.customRenderUrl,
                          compat: Boolean(scope.customRenderCompat),
                          proxy: Boolean(scope.customRenderProxy)
                      }
                  }
                : {}),
            ...(boundSource ? { boundSource } : {})
        });
    }

    const mergedByNumericId = new Map<number, Layer>();
    for (const layer of scope.layers.values()) {
        mergedByNumericId.set(layer.numericId, layer);
    }
    for (const layer of controllerTransient.values()) {
        mergedByNumericId.set(layer.numericId, layer);
    }

    const payload = JSON.stringify({
        type: 'hydrate',
        layers: Array.from(mergedByNumericId.values()),
        ...(scope.customRenderUrl
            ? {
                  customRender: {
                      url: scope.customRenderUrl,
                      compat: Boolean(scope.customRenderCompat),
                      proxy: Boolean(scope.customRenderProxy)
                  }
              }
            : {}),
        ...(boundSource ? { boundSource } : {})
    });
    return payload;
}

export function upsertControllerTransientLayer(wallId: string, layer: Layer) {
    let byId = controllerTransientByWallId.get(wallId);
    if (!byId) {
        byId = new Map<number, Layer>();
        controllerTransientByWallId.set(wallId, byId);
    }
    byId.set(layer.numericId, layer);
}

export function deleteControllerTransientLayer(wallId: string, numericId: number): boolean {
    const byId = controllerTransientByWallId.get(wallId);
    if (!byId) return false;
    const deleted = byId.delete(numericId);
    if (byId.size === 0) controllerTransientByWallId.delete(wallId);
    return deleted;
}

export function deleteControllerTransientLayerForScope(
    scopeId: ScopeId,
    numericId: number
): boolean {
    const watchers = scopeWatchers.get(scopeId);
    if (!watchers || watchers.size === 0) return false;
    let deleted = false;
    for (const wallId of watchers) {
        if (deleteControllerTransientLayer(wallId, numericId)) deleted = true;
    }
    return deleted;
}

export function clearControllerTransientForWall(wallId: string) {
    if (!controllerTransientByWallId.has(wallId)) return;
    controllerTransientByWallId.delete(wallId);
}

export function clearControllerTransientForScope(scopeId: ScopeId) {
    const watchers = scopeWatchers.get(scopeId);
    if (!watchers || watchers.size === 0) return;
    for (const wallId of watchers) clearControllerTransientForWall(wallId);
}

export function bindWall(wallId: string, scopeId: ScopeId, source: 'live' | 'gallery' = 'gallery') {
    const oldScopeId = wallBindings.get(wallId);
    clearControllerTransientForWall(wallId);

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
    wallBindingSources.set(wallId, source);
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
    clearControllerTransientForWall(wallId);
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
    wallBindingSources.delete(wallId);
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

export function estimatePlaybackLeadMs(scopeId: ScopeId): number {
    const targets = wallPeersByScope.get(scopeId);
    if (!targets || targets.size === 0) return 180;

    let congested = 0;
    for (const entry of targets) {
        if (!canSendNonCritical(entry.peer)) congested += 1;
    }

    // Adaptive lead:
    // - scale with fanout size,
    // - add extra margin when some peers are congested.
    const dynamic = 160 + Math.min(420, targets.size * 15 + congested * 120);
    return Math.max(120, Math.min(600, dynamic));
}

export function sendJSON(peer: Peer, data: GSMessage) {
    markOutgoing(1, 0);
    peer.send(JSON.stringify(data));
}

export function broadcastToEditorsRaw(scopeId: ScopeId, payload: string, exclude?: PeerEntry) {
    const set = editorsByScope.get(scopeId);
    if (!set) return;
    let sent = 0;
    for (const entry of set) {
        if (entry !== exclude) {
            entry.peer.send(payload);
            sent += 1;
        }
    }
    markOutgoing(sent, 0);
}

export function broadcastToEditors(scopeId: ScopeId, data: GSMessage, exclude?: PeerEntry) {
    broadcastToEditorsRaw(scopeId, JSON.stringify(data), exclude);
}

export function broadcastToWallsRaw(scopeId: ScopeId, payload: string) {
    const set = wallPeersByScope.get(scopeId);
    if (!set) return;
    for (const entry of set) entry.peer.send(payload);
    markOutgoing(set.size, 0);
}

export function broadcastToWallNodesRaw(wallId: string, payload: string) {
    const wallPeers = wallsByWallId.get(wallId);
    if (!wallPeers) return;
    for (const entry of wallPeers) entry.peer.send(payload);
    markOutgoing(wallPeers.size, 0);
}

export function broadcastToControllersByWallRaw(
    wallId: string,
    payload: string,
    exclude?: PeerEntry
) {
    const controllers = controllersByWallId.get(wallId);
    if (!controllers) return;
    let sent = 0;
    for (const entry of controllers) {
        if (entry !== exclude) {
            entry.peer.send(payload);
            sent += 1;
        }
    }
    markOutgoing(sent, 0);
}

export function broadcastToControllersByScopeRaw(scopeId: ScopeId, payload: string) {
    const watchers = scopeWatchers.get(scopeId);
    if (!watchers || watchers.size === 0) return;
    let sent = 0;
    for (const wallId of watchers) {
        const controllers = controllersByWallId.get(wallId);
        if (!controllers) continue;
        for (const entry of controllers) {
            entry.peer.send(payload);
            sent += 1;
        }
    }
    markOutgoing(sent, 0);
}

export function broadcastToWalls(scopeId: ScopeId, data: GSMessage) {
    broadcastToWallsRaw(scopeId, JSON.stringify(data));
}

export function broadcastToWallsBinary(scopeId: ScopeId, data: ArrayBuffer) {
    const set = wallPeersByScope.get(scopeId);
    if (!set) return;
    let sent = 0;
    for (const entry of set) {
        if (canSendNonCritical(entry.peer)) {
            entry.peer.send(data);
            sent += 1;
        }
    }
    markOutgoing(0, sent);
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

/** Broadcast a payload to all editors whose scope matches a given commitId (across all slides). */
export function broadcastToEditorsByCommit(commitId: string, payload: string, exclude?: PeerEntry) {
    const scopeIds = commitToScopeIds.get(commitId);
    if (!scopeIds) return;
    let sent = 0;
    for (const scopeId of scopeIds) {
        const set = editorsByScope.get(scopeId);
        if (!set) continue;
        for (const entry of set) {
            if (entry !== exclude) {
                entry.peer.send(payload);
                sent += 1;
            }
        }
    }
    markOutgoing(sent, 0);
}

function notifyControllersByWallIds(wallIds: Set<string>, payload: string) {
    let sent = 0;
    for (const wallId of wallIds) {
        const entries = controllersByWallId.get(wallId);
        if (!entries) continue;
        for (const entry of entries) {
            entry.peer.send(payload);
            sent += 1;
        }
    }
    markOutgoing(sent, 0);
}

/** Notify all controllers whose wall is bound to any scope with the given commitId. */
export function notifyControllersByCommit(commitId: string, payload: string) {
    const scopeIds = commitToScopeIds.get(commitId);
    if (!scopeIds) return;

    const wallIds = new Set<string>();
    for (const scopeId of scopeIds) {
        const watchers = scopeWatchers.get(scopeId);
        if (!watchers) continue;
        for (const wallId of watchers) wallIds.add(wallId);
    }
    notifyControllersByWallIds(wallIds, payload);
}

// Hydrate all wall peers for a given wallId with their bound scope's layers
export function hydrateWallNodes(wallId: string) {
    const scopeId = wallBindings.get(wallId);
    const payload = scopeId !== undefined ? getWallHydratePayload(scopeId, wallId) : EMPTY_HYDRATE;

    const wallPeers = wallsByWallId.get(wallId);
    if (!wallPeers) return;
    for (const entry of wallPeers) entry.peer.send(payload);
    markOutgoing(wallPeers.size, 0);
}

/**
 * Update customRenderUrl for all active scopes belonging to a project,
 * invalidate their hydrate caches, and re-hydrate any bound walls.
 */
export function updateProjectCustomRenderSettings(
    projectId: string,
    customRenderUrl: string | undefined,
    customRenderCompat?: boolean,
    customRenderProxy?: boolean
) {
    const affectedWallIds = new Set<string>();
    for (const [scopeId, scope] of scopedState) {
        if (scope.projectId !== projectId) continue;
        scope.customRenderUrl = customRenderUrl;
        if (customRenderCompat !== undefined) {
            scope.customRenderCompat = customRenderCompat;
        }
        if (customRenderProxy !== undefined) {
            scope.customRenderProxy = customRenderProxy;
        }
        scope.hydrateCache = null;
        // Find walls bound to this scope
        for (const [wallId, boundScopeId] of wallBindings) {
            if (boundScopeId === scopeId) affectedWallIds.add(wallId);
        }
    }
    for (const wallId of affectedWallIds) {
        hydrateWallNodes(wallId);
        const boundScope = wallBindings.get(wallId);
        if (boundScope !== undefined) {
            broadcastToControllersByWallRaw(wallId, getWallHydratePayload(boundScope, wallId));
        }
    }
}

// Notify all controllers for a wallId about binding status
export function notifyControllers(
    wallId: string,
    bound: boolean,
    projectId?: string,
    commitId?: string,
    slideId?: string,
    customRenderUrl?: string
) {
    const entries = controllersByWallId.get(wallId);
    if (!entries) return;

    const payload = JSON.stringify({
        type: 'wall_binding_status',
        wallId,
        bound,
        ...(projectId ? { projectId } : {}),
        ...(commitId ? { commitId } : {}),
        ...(slideId ? { slideId } : {}),
        ...(customRenderUrl ? { customRenderUrl } : {})
    } satisfies GSMessage);

    for (const entry of entries) entry.peer.send(payload);
    markOutgoing(entries.size, 0);
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
    playback: { status: 'playing' | 'paused'; anchorMediaTime: number; anchorServerTime: number },
    opts?: { criticalToWalls?: boolean }
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
        const criticalToWalls = opts?.criticalToWalls ?? false;
        let sent = 0;
        for (const entry of targets) {
            if (criticalToWalls || canSendNonCritical(entry.peer)) {
                entry.peer.send(frame);
                sent += 1;
            }
        }
        markOutgoing(0, sent);
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
        _telemetry.videoSyncFrames += 1;
        _telemetry.videoSyncEntries += entries.length;
    }
    markOutgoing(0, peerBatches.size);
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
const scopeCleanupTimers: Map<ScopeId, ReturnType<typeof setTimeout>> = _hmr.scopeCleanupTimers;
const WALL_UNBIND_GRACE_MS = 5_000; // 5 seconds
const wallUnbindTimers: Map<string, ReturnType<typeof setTimeout>> = _hmr.wallUnbindTimers;

export function scheduleWallUnbindGrace(wallId: string, onExpire: () => void) {
    if (wallUnbindTimers.has(wallId)) return;
    const timer = setTimeout(() => {
        wallUnbindTimers.delete(wallId);
        onExpire();
    }, WALL_UNBIND_GRACE_MS);
    wallUnbindTimers.set(wallId, timer);
}

export function cancelWallUnbindGrace(wallId: string) {
    const timer = wallUnbindTimers.get(wallId);
    if (!timer) return;
    clearTimeout(timer);
    wallUnbindTimers.delete(wallId);
}

// Garbage collection if no editors or walls are watching a scope
export function scheduleScopeCleanup(scopeId: ScopeId) {
    // Don't schedule if there are still editors or walls in this scope
    const editors = editorsByScope.get(scopeId);
    if (editors && editors.size > 0) return;
    const watchers = scopeWatchers.get(scopeId);
    if (watchers && watchers.size > 0) return;

    // Transient controller layers should not outlive active viewers.
    // Clear immediately when a scope becomes unobserved, even before full scope GC.
    clearControllerTransientForScope(scopeId);

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
    // Re-check: someone may have reconnected during the grace period
    const editors = editorsByScope.get(scopeId);
    if (editors && editors.size > 0) return;
    const watchers = scopeWatchers.get(scopeId);
    if (watchers && watchers.size > 0) return;

    const scope = scopedState.get(scopeId);
    if (!scope) {
        // Defensive cleanup for orphaned scope IDs (e.g. partial state after HMR).
        clearActiveVideosForScope(scopeId);
        clearControllerTransientForScope(scopeId);

        editorsByScope.delete(scopeId);
        wallPeersByScope.delete(scopeId);
        scopeWatchers.delete(scopeId);

        const key = scopeIdToKey.get(scopeId);
        if (key) {
            scopeKeyToId.delete(key);
            scopeIdToKey.delete(scopeId);
        }
        return;
    }

    console.log(`[Bus] Cleaning up scope ${scopeLabel(scopeId)}`);

    // Auto-save if dirty
    if (scope.dirty) {
        await saveScope(scopeId, 'Auto-save before scope cleanup', true);
    }

    // Purge layer-node entries
    // clearLayerNodesForScope(scopeId);

    // Purge active videos
    clearActiveVideosForScope(scopeId);
    clearControllerTransientForScope(scopeId);

    // Purge scope state
    scopedState.delete(scopeId);

    const scopeIds = commitToScopeIds.get(scope.commitId);
    if (scopeIds) {
        scopeIds.delete(scopeId);
        if (scopeIds.size === 0) commitToScopeIds.delete(scope.commitId);
    }

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

const PING_TIMEOUT_MS = 60_000; // Force-close peers with no ping for 60s

// Last clock-ping timestamp per peer. Updated in handleBinary CLOCK_PING handler
export const lastPingSeen: Map<string, number> = _hmr.lastPingSeen;

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
        `[WS] Peers: ${peerCounts.editor} editors, ${peerCounts.wall} walls, ${peerCounts.controller} controllers, ${peerCounts.gallery} galleries, ${peerCounts.roy} roys`
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
    scopeId: ScopeId,
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

        const updatedSlides = await buildSlidesSnapshot(scopeId, scope, headId);

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

/**
 * Persist slide metadata (id, order, name) to the commit document.
 * Only updates metadata fields — never touches layers.
 */
export async function persistSlideMetadata(
    commitId: string,
    slides: Array<{ id: string; order: number; name: string }>
): Promise<boolean> {
    try {
        const commit = await db.collection('commits').findOne({ _id: new ObjectId(commitId) });
        if (!commit?.content?.slides) return false;

        const existingSlides: Array<{ id: string; order: number; name: string; layers: any[] }> =
            commit.content.slides;

        // Build a lookup of new metadata by slide id
        const metaById = new Map(slides.map((s) => [s.id, s]));

        // Update existing slides' metadata, preserve layers
        const updatedSlides = existingSlides.map((s) => {
            const meta = metaById.get(s.id);
            if (meta) {
                return { ...s, order: meta.order, name: meta.name };
            }
            return s;
        });

        // Add any new slides that don't exist yet (empty layers)
        const existingSlideIds = new Set(existingSlides.map((s) => s.id));
        for (const meta of slides) {
            if (!existingSlideIds.has(meta.id)) {
                updatedSlides.push({ id: meta.id, order: meta.order, name: meta.name, layers: [] });
            }
        }

        // Sort by order
        updatedSlides.sort((a, b) => a.order - b.order);

        await db
            .collection('commits')
            .updateOne(
                { _id: new ObjectId(commitId) },
                { $set: { 'content.slides': updatedSlides, updatedAt: new Date() } }
            );

        return true;
    } catch (err) {
        console.error(`[Bus] persistSlideMetadata failed for commit ${commitId}:`, err);
        return false;
    }
}

// ── MongoDB Change Stream: live asset updates ──────────────────────────────

/** Broadcast asset_added to all editors working on the same project (across all scopes). */
export function broadcastAssetToEditorsByProject(
    projectId: string,
    asset: Record<string, unknown>
) {
    const payload = JSON.stringify({ type: 'asset_added', projectId, asset });
    let sent = 0;
    for (const [scopeId, scope] of scopedState) {
        if (scope.projectId === projectId) {
            const set = editorsByScope.get(scopeId);
            if (!set) continue;
            for (const entry of set) {
                entry.peer.send(payload);
                sent++;
            }
        }
    }
    markOutgoing(sent, 0);
    console.log(
        `[Bus] asset_added broadcast: projectId=${projectId}, sent to ${sent} editor(s), scopes=${scopedState.size}`
    );
}

function startAssetChangeStream() {
    try {
        const changeStream = db
            .collection('assets')
            .watch([{ $match: { operationType: 'insert' } }], { fullDocument: 'updateLookup' });

        changeStream.on('change', (change) => {
            if (change.operationType === 'insert' && change.fullDocument) {
                const doc = change.fullDocument;
                broadcastAssetToEditorsByProject(doc.projectId.toString(), {
                    _id: doc._id.toString(),
                    name: doc.name,
                    url: doc.url,
                    size: doc.size,
                    // Convert null → undefined so JSON.stringify strips them
                    // (Zod z.string().optional() rejects null)
                    mimeType: doc.mimeType ?? undefined,
                    blurhash: doc.blurhash ?? undefined,
                    previewUrl: doc.previewUrl ?? undefined,
                    createdAt: String(doc.createdAt),
                    createdBy: String(doc.createdBy)
                });
            }
        });

        changeStream.on('error', (err) => {
            console.error('[Bus] Asset change stream error:', err);
        });

        console.log('[Bus] Asset change stream started');
        return changeStream;
    } catch (err) {
        console.error('[Bus] Failed to start asset change stream:', err);
        return null;
    }
}

// HMR-safe: only start once
if (!(process as any).__ASSET_CHANGE_STREAM__) {
    (process as any).__ASSET_CHANGE_STREAM__ = startAssetChangeStream();
}
