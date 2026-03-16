import { defineWebSocketHandler } from 'nitro/h3';

import {
    peers,
    scopedState,
    wallBindings,
    editorsByScope,
    allEditors,
    activeVideos,
    registerPeer,
    unregisterPeer,
    getOrCreateScope,
    internScope,
    scopeLabel,
    bindWall,
    unbindWall,
    sendJSON,
    broadcastToEditors,
    broadcastToWallsBinary,
    broadcastToScope,
    broadcastToScopeRaw,
    broadcastToWallsRaw,
    hydrateWallNodes,
    notifyControllers,
    logPeerCounts,
    seedScopeFromDb,
    saveScope,
    resolveScopeId,
    registerActiveVideo,
    unregisterActiveVideo,
    clearActiveVideosForScope,
    // recomputeLayerNodes,
    // recomputeAllLayerNodes,
    sendVideoSyncToRelevantWalls,
    broadcastVideoSyncBatchToWalls,
    // deleteLayerNodes,
    // clearLayerNodesForScope,
    invalidateHydrateCache,
    getHydratePayload,
    touchPing,
    reapStalePeers,
    // layerNodes,
    // canSendNonCritical,
    EMPTY_HYDRATE,
    type PeerEntry
} from '~/lib/busState';
import { HelloSchema, GSMessageSchema, makeScopeLabel, type GSMessage } from '~/lib/types';

// ── Binary opcodes ──────────────────────────────────────────────────────────

const OP = {
    SPATIAL_MOVE: 0x05,
    CLOCK_PING: 0x08,
    CLOCK_PONG: 0x09,
    // Reserved for future binary migration
    UPSERT_LAYER: 0x10,
    DELETE_LAYER: 0x11,
    VIDEO_PLAY: 0x12,
    VIDEO_PAUSE: 0x13,
    VIDEO_SEEK: 0x14,
    VIDEO_SYNC: 0x15
} as const;

const pongBuf = new ArrayBuffer(25);
const pongView = new DataView(pongBuf);
pongView.setUint8(0, OP.CLOCK_PONG);

function hasType(raw: unknown): raw is { type: string; [k: string]: unknown } {
    return typeof raw === 'object' && raw !== null && typeof (raw as any).type === 'string';
}

interface HandlerCtx {
    entry: PeerEntry;
    data: Record<string, any>;
    scopeId: number | null;
    rawText: string;
}

type Handler = (ctx: HandlerCtx) => void;

const handlers = new Map<string, Handler>();

handlers.set('rehydrate_please', ({ entry }) => {
    const { meta } = entry;

    if (meta.specimen === 'editor') {
        entry.peer.send(getHydratePayload(meta.scopeId));
    } else if (meta.specimen === 'wall') {
        const boundScope = wallBindings.get(meta.wallId);
        entry.peer.send(boundScope !== undefined ? getHydratePayload(boundScope) : EMPTY_HYDRATE);
    }
});

handlers.set('clear_stage', ({ entry, scopeId }) => {
    if (scopeId === null) return;
    const scope = scopedState.get(scopeId);
    if (scope) {
        scope.layers.clear();
        scope.dirty = true;
    }
    clearActiveVideosForScope(scopeId);
    // clearLayerNodesForScope(scopeId);
    invalidateHydrateCache(scopeId);
    broadcastToScope(scopeId, { type: 'hydrate', layers: [] }, entry);
});

handlers.set('upsert_layer', ({ entry, data, scopeId, rawText }) => {
    const layer = data.layer;
    if (typeof layer?.numericId !== 'number') return;

    let relayPayload = rawText;

    // Server-side mutation: inject default playback for video layers
    if (layer.type === 'video' && !layer.playback) {
        layer.playback = {
            status: 'paused',
            anchorMediaTime: 0,
            anchorServerTime: 0
        };
        relayPayload = JSON.stringify(data);
    }

    if (scopeId !== null) {
        const scope = scopedState.get(scopeId);
        if (scope) {
            scope.layers.set(layer.numericId, layer);
            scope.dirty = true;
        }
        // recomputeLayerNodes(layer.numericId, layer, scopeId);
        invalidateHydrateCache(scopeId);
        broadcastToScopeRaw(scopeId, relayPayload, entry);
    }
});

handlers.set('delete_layer', ({ entry, data, scopeId, rawText }) => {
    if (scopeId === null) return;
    const scope = scopedState.get(scopeId);
    if (scope) {
        scope.layers.delete(data.numericId);
        scope.dirty = true;
    }
    unregisterActiveVideo(data.numericId);
    // deleteLayerNodes(data.numericId);
    invalidateHydrateCache(scopeId);
    broadcastToScopeRaw(scopeId, rawText, entry);
});

handlers.set('seed_scope', ({ entry, data, scopeId }) => {
    if (scopeId === null) return;
    const scope = scopedState.get(scopeId);
    if (!scope) return;

    // Replace all layers wholesale
    scope.layers.clear();
    for (const layer of data.layers) {
        if (typeof layer?.numericId === 'number') {
            scope.layers.set(layer.numericId, layer);
        }
    }
    scope.dirty = true;

    clearActiveVideosForScope(scopeId);
    invalidateHydrateCache(scopeId);

    // Cascade hydrate to all bound walls
    for (const [wallId, boundScope] of wallBindings) {
        if (boundScope === scopeId) {
            hydrateWallNodes(wallId);
        }
    }

    // Broadcast hydrate to other editors in scope
    broadcastToEditors(
        scopeId,
        { type: 'hydrate', layers: Array.from(scope.layers.values()) },
        entry
    );
});

handlers.set('reboot', ({ scopeId, rawText }) => {
    if (scopeId !== null) {
        broadcastToWallsRaw(scopeId, rawText);
    }
});

handlers.set('stage_dirty', ({ scopeId }) => {
    if (scopeId === null) return;
    const scope = scopedState.get(scopeId);
    if (scope) scope.dirty = true;
});

handlers.set('stage_save', ({ entry, data, scopeId }) => {
    if (scopeId === null) {
        sendJSON(entry.peer, {
            type: 'stage_save_response',
            success: false,
            error: 'Not in a scope'
        });
        return;
    }

    const capturedScopeId = scopeId;
    const capturedEntry = entry;

    saveScope(capturedScopeId, data.message, data.isAutoSave ?? false).then((result) => {
        const response: GSMessage = {
            type: 'stage_save_response',
            success: result.success,
            commitId: result.commitId,
            error: result.error
        };
        sendJSON(capturedEntry.peer, response);

        if (result.success) {
            broadcastToEditors(capturedScopeId, response, capturedEntry);
        }
    });
});

handlers.set('bind_wall', ({ data }) => {
    const scopeId = internScope(data.projectId, data.commitId, data.slideId);
    const scope = getOrCreateScope(scopeId, data.projectId, data.commitId, data.slideId);
    bindWall(data.wallId, scopeId);

    const finish = () => {
        hydrateWallNodes(data.wallId);
        notifyControllers(data.wallId, true, data.projectId, data.commitId, data.slideId);
    };

    if (scope.layers.size === 0) {
        // Fresh scope — auto-seed from DB before hydrating walls
        seedScopeFromDb(scopeId).then(finish);
    } else {
        finish();
    }

    console.log(
        `[WS] Wall ${data.wallId} bound to scope=${makeScopeLabel(data.projectId, data.commitId, data.slideId)}`
    );
});

handlers.set('unbind_wall', ({ data }) => {
    unbindWall(data.wallId);
    hydrateWallNodes(data.wallId);
    notifyControllers(data.wallId, false);
    console.log(`[WS] Wall ${data.wallId} unbound`);
});

handlers.set('video_play', ({ data, scopeId }) => {
    if (scopeId === null) return;
    const layer = scopedState.get(scopeId)?.layers.get(data.numericId);
    if (layer?.type === 'video') {
        layer.playback.status = 'playing';
        layer.playback.anchorServerTime = Date.now() + 500;
        registerActiveVideo(data.numericId, scopeId, layer);
        sendVideoSyncToRelevantWalls(data.numericId, scopeId, layer.playback);
    }
});

handlers.set('video_pause', ({ data, scopeId }) => {
    if (scopeId === null) return;
    const layer = scopedState.get(scopeId)?.layers.get(data.numericId);
    if (layer?.type === 'video' && layer.playback.status === 'playing') {
        let elapsed = (Date.now() - layer.playback.anchorServerTime) / 1000;
        if (elapsed < 0) elapsed = 0;

        layer.playback.status = 'paused';
        layer.playback.anchorMediaTime += elapsed;
        layer.playback.anchorServerTime = 0;

        unregisterActiveVideo(data.numericId);
        sendVideoSyncToRelevantWalls(data.numericId, scopeId, layer.playback);
    }
});

handlers.set('video_seek', ({ data, scopeId }) => {
    if (scopeId === null) return;
    const layer = scopedState.get(scopeId)?.layers.get(data.numericId);
    if (layer?.type === 'video') {
        layer.playback.status = 'paused';
        layer.playback.anchorMediaTime = data.mediaTime;
        layer.playback.anchorServerTime = 0;

        unregisterActiveVideo(data.numericId);
        sendVideoSyncToRelevantWalls(data.numericId, scopeId, layer.playback);
    }
});

function handleHello(peer: import('crossws').Peer, data: Record<string, any>) {
    // Full Zod validation on handshake
    const parsed = HelloSchema.parse(data);

    // Re-registration: clean up old state first
    const existing = peers.get(peer.id);
    if (existing) unregisterPeer(peer.id);

    if (parsed.specimen === 'editor') {
        const scopeId = internScope(parsed.projectId, parsed.commitId, parsed.slideId);
        const scope = getOrCreateScope(scopeId, parsed.projectId, parsed.commitId, parsed.slideId);

        registerPeer(peer, {
            specimen: 'editor',
            projectId: parsed.projectId,
            commitId: parsed.commitId,
            slideId: parsed.slideId,
            scopeId
        });

        if (scope.layers.size === 0) {
            // Fresh scope — auto-seed from DB so the editor gets layers immediately
            seedScopeFromDb(scopeId).then(() => {
                peer.send(getHydratePayload(scopeId));
            });
        } else {
            peer.send(getHydratePayload(scopeId));
        }

        console.log(
            `[WS] Editor joined scope=${makeScopeLabel(parsed.projectId, parsed.commitId, parsed.slideId)}`
        );
        logPeerCounts();
        return;
    }

    if (parsed.specimen === 'wall') {
        registerPeer(peer, {
            specimen: 'wall',
            wallId: parsed.wallId,
            col: parsed.col,
            row: parsed.row
        });

        const boundScope = wallBindings.get(parsed.wallId);

        peer.send(boundScope !== undefined ? getHydratePayload(boundScope) : EMPTY_HYDRATE);

        // if (boundScope !== undefined) recomputeAllLayerNodes(boundScope);

        console.log(
            `[WS] Wall joined wallId=${parsed.wallId} ` +
                `(bound=${boundScope !== undefined ? scopeLabel(boundScope) : 'none'})`
        );
        logPeerCounts();
        return;
    }

    if (parsed.specimen === 'controller') {
        registerPeer(peer, { specimen: 'controller', wallId: parsed.wallId });

        const boundScope = wallBindings.get(parsed.wallId);
        const scope = boundScope !== undefined ? scopedState.get(boundScope) : null;
        sendJSON(peer, {
            type: 'wall_binding_status',
            wallId: parsed.wallId,
            bound: boundScope !== undefined,
            ...(scope
                ? { projectId: scope.projectId, commitId: scope.commitId, slideId: scope.slideId }
                : {})
        });

        console.log(`[WS] Controller joined wallId=${parsed.wallId}`);
        logPeerCounts();
        return;
    }

    if (parsed.specimen === 'roy') {
        registerPeer(peer, { specimen: 'roy' });
        console.log('[WS] Roy client joined');
        logPeerCounts();
        return;
    }
}

// ── Binary message handler ──────────────────────────────────────────────────

function handleBinary(peer: import('crossws').Peer, rawData: ArrayBuffer) {
    const view = new DataView(rawData);
    const opcode = view.getUint8(0);

    // Clock Ping → Pong (pre-allocated buffer, zero alloc)
    if (opcode === OP.CLOCK_PING) {
        touchPing(peer.id);
        const t0 = view.getFloat64(1, true);
        const t1 = Date.now();
        const t2 = Date.now();

        pongView.setFloat64(1, t0, true);
        pongView.setFloat64(9, t1, true);
        pongView.setFloat64(17, t2, true);
        peer.send(pongBuf);
        return;
    }

    // Spatial Move — scoped relay with AABB filtering for walls
    if (opcode === OP.SPATIAL_MOVE) {
        const senderEntry = peers.get(peer.id);
        if (!senderEntry) return;

        const senderScopeId = resolveScopeId(senderEntry.meta);
        if (senderScopeId === null) return;

        // Relay to editors (direct PeerEntry iteration, no map lookups per recipient)
        const editorEntries = editorsByScope.get(senderScopeId);
        if (editorEntries) {
            for (const entry of editorEntries) {
                if (entry !== senderEntry) entry.peer.send(rawData);
            }
        }

        // // Relay to walls: use AABB-filtered layerNodes when available
        // // Extract layer numericId from binary: offset 3 = first entry's id (u16 LE)
        // const layerId = view.getUint16(3, true);
        // const targets = layerNodes.get(layerId);
        // if (targets) {
        //     for (const entry of targets) {
        //         if (canSendNonCritical(entry.peer)) entry.peer.send(rawData);
        //     }
        // } else {
        broadcastToWallsBinary(senderScopeId, rawData);
        // }
    }
}

// ── WebSocket Handler ───────────────────────────────────────────────────────

export default defineWebSocketHandler({
    open(peer) {
        peer.websocket.binaryType = 'arraybuffer';
        console.log(`[WS] Peer ${peer.id} connected`);
    },

    close(peer) {
        unregisterPeer(peer.id);
        logPeerCounts();
    },

    message(peer, message) {
        // ── Binary fast-path ─────────────────────────────────────────
        if (message.rawData instanceof ArrayBuffer) {
            handleBinary(peer, message.rawData);
            return;
        }

        // ── JSON path ────────────────────────────────────────────────
        if (message.rawData instanceof Buffer) {
            const rawText = message.text();

            try {
                const data = JSON.parse(rawText);

                if (!hasType(data)) {
                    console.warn(`[WS] Invalid message from peer ${peer.id}: missing type`);
                    return;
                }

                // Hello: full Zod validation (cold path, once per connection)
                if (data.type === 'hello') {
                    handleHello(peer, data);
                    return;
                }

                // All other messages: require registered peer
                const entry = peers.get(peer.id);
                if (!entry) {
                    console.warn(`[WS] Message from unregistered peer ${peer.id}, ignoring`);
                    return;
                }

                const handler = handlers.get(data.type);
                if (handler) {
                    handler({
                        entry,
                        data,
                        scopeId: resolveScopeId(entry.meta),
                        rawText
                    });
                }
            } catch (err) {
                // Fallback: run full Zod for diagnostic clarity
                try {
                    const reparsed = JSON.parse(rawText);
                    const result = GSMessageSchema.safeParse(reparsed);
                    if (!result.success) {
                        console.warn(
                            `[WS] Peer ${peer.id} sent invalid message:`,
                            result.error.issues
                        );
                    } else {
                        console.error(`[WS] Handler error for valid message:`, err);
                    }
                } catch {
                    console.error(`[WS] Unparseable message from peer ${peer.id}:`, err);
                }
            }
        }
    }
});

// ── Global bridge for upload progress ────────────────────────────────────────
// Uses the flat allEditors set — no scan of full peers map needed.

(process as any).__BROADCAST_EDITORS__ = (data: unknown) => {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    for (const entry of allEditors) {
        entry.peer.send(payload);
    }
};

// ── VSYNC loop (iterates active videos only) ─────────────────────────────────
// O(playing videos) instead of O(scopes × layers).

if ((process as any).__VSYNC_INTERVAL__) clearInterval((process as any).__VSYNC_INTERVAL__);
(process as any).__VSYNC_INTERVAL__ = setInterval(() => {
    const now = Date.now();
    const batch: Array<{
        numericId: number;
        scopeId: number;
        playback: {
            status: 'playing' | 'paused';
            anchorMediaTime: number;
            anchorServerTime: number;
        };
    }> = [];

    for (const [numericId, { scopeId, layer }] of activeVideos) {
        if (layer.type !== 'video' || !layer.playback || layer.playback.status !== 'playing') {
            activeVideos.delete(numericId);
            continue;
        }

        const duration = layer.duration;
        if (duration <= 0) continue;

        const elapsed = Math.max(0, (now - layer.playback.anchorServerTime) / 1000);
        const expected = layer.playback.anchorMediaTime + elapsed;

        if (expected >= duration) {
            if (layer.loop ?? true) {
                layer.playback.anchorMediaTime = !duration ? 0 : expected % duration;
                layer.playback.anchorServerTime = now;
            } else {
                layer.playback.status = 'paused';
                layer.playback.anchorMediaTime = duration;
                layer.playback.anchorServerTime = 0;
                activeVideos.delete(numericId);
            }

            batch.push({ numericId, scopeId, playback: { ...layer.playback } });
        }
    }

    if (batch.length > 0) broadcastVideoSyncBatchToWalls(batch);
}, 500);

const AUTO_SAVE_INTERVAL = 30_000;

if ((process as any).__AUTO_SAVE_INTERVAL__) clearInterval((process as any).__AUTO_SAVE_INTERVAL__);
(process as any).__AUTO_SAVE_INTERVAL__ = setInterval(() => {
    for (const [scopeId, scope] of scopedState) {
        if (scope.dirty) {
            console.log(`[Bus] Auto-saving scope ${scopeLabel(scopeId)}`);
            saveScope(scopeId, 'Auto-save', true).then((result) => {
                if (result.success) {
                    broadcastToEditors(scopeId, {
                        type: 'stage_save_response',
                        success: true,
                        commitId: result.commitId
                    });
                } else {
                    console.error(
                        `[Bus] Auto-save failed for scope ${scopeLabel(scopeId)}:`,
                        result.error
                    );
                }
            });
        }
    }
}, AUTO_SAVE_INTERVAL);

if ((process as any).__REAPER_INTERVAL__) clearInterval((process as any).__REAPER_INTERVAL__);
(process as any).__REAPER_INTERVAL__ = setInterval(() => {
    reapStalePeers();
}, 10_000);

if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        if ((process as any).__VSYNC_INTERVAL__) clearInterval((process as any).__VSYNC_INTERVAL__);
        if ((process as any).__AUTO_SAVE_INTERVAL__)
            clearInterval((process as any).__AUTO_SAVE_INTERVAL__);
        if ((process as any).__REAPER_INTERVAL__)
            clearInterval((process as any).__REAPER_INTERVAL__);
    });
}
