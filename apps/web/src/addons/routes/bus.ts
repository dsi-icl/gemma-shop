import { defineWebSocketHandler } from 'nitro/h3';

import {
    peers,
    scopedState,
    wallBindings,
    editorsByScope,
    registerPeer,
    unregisterPeer,
    getOrCreateScope,
    bindWall,
    unbindWall,
    sendJSON,
    broadcastToEditors,
    broadcastToWalls,
    broadcastToWallsBinary,
    broadcastToScope,
    hydrateWallNodes,
    notifyControllers,
    logPeerCounts,
    saveScope,
    resolveScopeKey
} from '~/lib/busState';
import { GSMessageSchema, makeScopeKey, type GSMessage } from '~/lib/types';
import { upsertWallConnection, decrementWallConnection } from '~/server/walls';

// ── WebSocket Handler ───────────────────────────────────────────────────────

export default defineWebSocketHandler({
    open(peer) {
        peer.websocket.binaryType = 'arraybuffer';
        console.log(`[WS] Peer ${peer.id} connected`);
    },

    close(peer) {
        const meta = unregisterPeer(peer.id);
        if (meta && (meta.specimen === 'wall' || meta.specimen === 'controller')) {
            decrementWallConnection(meta.wallId).catch(() => {});
        }
        logPeerCounts();
    },

    message(peer, message) {
        // --- 1. JSON SLOW-PATH & HANDSHAKE ---
        if (message.rawData instanceof Buffer) {
            try {
                const data = GSMessageSchema.parse(message.json());
                const entry = peers.get(peer.id);
                const meta = entry?.meta;

                // ── Hello / Handshake ────────────────────────────────────
                if (data.type === 'hello') {
                    if (entry) unregisterPeer(peer.id);

                    if (data.specimen === 'editor') {
                        const scopeKey = makeScopeKey(data.projectId, data.slideId);
                        const scope = getOrCreateScope(scopeKey, data.projectId, data.slideId);

                        registerPeer(peer, {
                            specimen: 'editor',
                            projectId: data.projectId,
                            slideId: data.slideId,
                            scopeKey
                        });

                        peer.send(
                            JSON.stringify({
                                type: 'hydrate',
                                layers: Array.from(scope.layers.values())
                            })
                        );

                        console.log(`[WS] Editor joined scope=${scopeKey}`);
                        logPeerCounts();
                        return;
                    }

                    if (data.specimen === 'wall') {
                        registerPeer(peer, { specimen: 'wall', wallId: data.wallId });
                        upsertWallConnection(data.wallId).catch(() => {});

                        const boundScope = wallBindings.get(data.wallId);
                        const layers = boundScope
                            ? Array.from(scopedState.get(boundScope)?.layers.values() ?? [])
                            : [];

                        peer.send(JSON.stringify({ type: 'hydrate', layers }));

                        console.log(
                            `[WS] Wall joined wallId=${data.wallId} (bound=${boundScope ?? 'none'})`
                        );
                        logPeerCounts();
                        return;
                    }

                    if (data.specimen === 'controller') {
                        registerPeer(peer, { specimen: 'controller', wallId: data.wallId });
                        upsertWallConnection(data.wallId).catch(() => {});

                        const boundScope = wallBindings.get(data.wallId);
                        const scope = boundScope ? scopedState.get(boundScope) : null;
                        sendJSON(peer, {
                            type: 'wall_binding_status',
                            wallId: data.wallId,
                            bound: !!boundScope,
                            ...(scope ? { projectId: scope.projectId, slideId: scope.slideId } : {})
                        });

                        console.log(`[WS] Controller joined wallId=${data.wallId}`);
                        logPeerCounts();
                        return;
                    }

                    if (data.specimen === 'roy') {
                        registerPeer(peer, { specimen: 'roy' });
                        console.log('[WS] Roy client joined');
                        logPeerCounts();
                        return;
                    }

                    return;
                }

                if (!meta) {
                    console.warn(`[WS] Message from unregistered peer ${peer.id}, ignoring`);
                    return;
                }

                const senderScopeKey = resolveScopeKey(meta);

                // ── Bind / Unbind wall ───────────────────────────────────
                if (data.type === 'bind_wall') {
                    const scopeKey = makeScopeKey(data.projectId, data.slideId);
                    getOrCreateScope(scopeKey, data.projectId, data.slideId);
                    bindWall(data.wallId, scopeKey);
                    hydrateWallNodes(data.wallId);
                    notifyControllers(data.wallId, true, data.projectId, data.slideId);
                    console.log(`[WS] Wall ${data.wallId} bound to scope=${scopeKey}`);
                    return;
                }

                if (data.type === 'unbind_wall') {
                    unbindWall(data.wallId);
                    hydrateWallNodes(data.wallId);
                    notifyControllers(data.wallId, false);
                    console.log(`[WS] Wall ${data.wallId} unbound`);
                    return;
                }

                // ── Rehydrate ────────────────────────────────────────────
                if (data.type === 'rehydrate_please') {
                    if (meta.specimen === 'editor') {
                        const scope = scopedState.get(meta.scopeKey);
                        if (scope) {
                            peer.send(
                                JSON.stringify({
                                    type: 'hydrate',
                                    layers: Array.from(scope.layers.values())
                                })
                            );
                        }
                    } else if (meta.specimen === 'wall') {
                        const boundScope = wallBindings.get(meta.wallId);
                        const layers = boundScope
                            ? Array.from(scopedState.get(boundScope)?.layers.values() ?? [])
                            : [];
                        peer.send(JSON.stringify({ type: 'hydrate', layers }));
                    }
                    return;
                }

                // ── Clear stage ──────────────────────────────────────────
                if (data.type === 'clear_stage') {
                    if (senderScopeKey) {
                        const scope = scopedState.get(senderScopeKey);
                        if (scope) {
                            scope.layers.clear();
                            scope.dirty = true;
                        }
                        broadcastToScope(senderScopeKey, { type: 'hydrate', layers: [] }, peer.id);
                    }
                    return;
                }

                // ── Layer upsert ─────────────────────────────────────────
                if (data.type === 'upsert_layer') {
                    const { layer } = data;
                    if (layer.type === 'video' && !layer.playback) {
                        layer.playback = {
                            status: 'paused',
                            anchorMediaTime: 0,
                            anchorServerTime: 0
                        };
                    }

                    if (senderScopeKey) {
                        const scope = scopedState.get(senderScopeKey);
                        if (scope) {
                            scope.layers.set(layer.numericId, layer);
                            scope.dirty = true;
                        }
                        broadcastToScope(senderScopeKey, data, peer.id);
                    }
                    return;
                }

                // ── Layer delete ─────────────────────────────────────────
                if (data.type === 'delete_layer') {
                    if (senderScopeKey) {
                        const scope = scopedState.get(senderScopeKey);
                        if (scope) {
                            scope.layers.delete(data.numericId);
                            scope.dirty = true;
                        }
                        broadcastToScope(senderScopeKey, data, peer.id);
                    }
                    return;
                }

                // ── Reboot ───────────────────────────────────────────────
                if (data.type === 'reboot') {
                    if (senderScopeKey) {
                        broadcastToWalls(senderScopeKey, data);
                    }
                    return;
                }

                // ── Save pipeline ────────────────────────────────────────
                if (data.type === 'stage_dirty') {
                    if (senderScopeKey) {
                        const scope = scopedState.get(senderScopeKey);
                        if (scope) scope.dirty = true;
                    }
                    return;
                }

                if (data.type === 'stage_save') {
                    if (!senderScopeKey) {
                        sendJSON(peer, {
                            type: 'stage_save_response',
                            success: false,
                            error: 'Not in a scope'
                        });
                        return;
                    }

                    const sk = senderScopeKey;
                    saveScope(sk, data.message, data.isAutoSave ?? false).then((result) => {
                        const response: GSMessage = {
                            type: 'stage_save_response',
                            success: result.success,
                            commitId: result.commitId,
                            error: result.error
                        };
                        sendJSON(peer, response);

                        if (result.success) {
                            broadcastToEditors(sk, response, peer.id);
                        }
                    });
                    return;
                }

                // ── Video playback ───────────────────────────────────────
                if (data.type === 'video_play') {
                    const layer = senderScopeKey
                        ? scopedState.get(senderScopeKey)?.layers.get(data.numericId)
                        : undefined;
                    if (layer?.type === 'video') {
                        layer.playback.status = 'playing';
                        layer.playback.anchorServerTime = Date.now() + 500;

                        broadcastToScope(senderScopeKey!, {
                            type: 'video_sync',
                            numericId: data.numericId,
                            playback: layer.playback
                        });
                    }
                    return;
                }

                if (data.type === 'video_pause') {
                    const layer = senderScopeKey
                        ? scopedState.get(senderScopeKey)?.layers.get(data.numericId)
                        : undefined;
                    if (layer?.type === 'video' && layer.playback.status === 'playing') {
                        let elapsed = (Date.now() - layer.playback.anchorServerTime) / 1000;
                        if (elapsed < 0) elapsed = 0;

                        layer.playback.status = 'paused';
                        layer.playback.anchorMediaTime += elapsed;
                        layer.playback.anchorServerTime = 0;

                        broadcastToScope(senderScopeKey!, {
                            type: 'video_sync',
                            numericId: data.numericId,
                            playback: layer.playback
                        });
                    }
                    return;
                }

                if (data.type === 'video_seek') {
                    const layer = senderScopeKey
                        ? scopedState.get(senderScopeKey)?.layers.get(data.numericId)
                        : undefined;
                    if (layer?.type === 'video') {
                        layer.playback.status = 'paused';
                        layer.playback.anchorMediaTime = data.mediaTime;
                        layer.playback.anchorServerTime = 0;

                        broadcastToScope(senderScopeKey!, {
                            type: 'video_sync',
                            numericId: data.numericId,
                            playback: layer.playback
                        });
                    }
                    return;
                }
            } catch (err) {
                console.error('[WS] Failed to parse JSON message:', err);
            }
            return;
        } else if (message.rawData instanceof ArrayBuffer) {
            // --- 2. BINARY FAST-PATH (Zero-Copy Relay) ---
            const view = new DataView(message.rawData);
            const opcode = view.getUint8(0);

            // A. Handle Clock Ping
            if (opcode === 0x08) {
                const t0 = view.getFloat64(1, true);
                const t1 = Date.now();
                const t2 = Date.now();

                const outBuffer = new ArrayBuffer(25);
                const outView = new DataView(outBuffer);
                outView.setUint8(0, 0x09);
                outView.setFloat64(1, t0, true);
                outView.setFloat64(9, t1, true);
                outView.setFloat64(17, t2, true);

                peer.send(outBuffer);
                return;
            }

            // B. Relay Spatial Moves — scoped
            if (opcode === 0x05) {
                const senderMeta = peers.get(peer.id)?.meta;
                if (!senderMeta) return;

                const senderScopeKey = resolveScopeKey(senderMeta);
                if (!senderScopeKey) return;

                const editorIds = editorsByScope.get(senderScopeKey);
                if (editorIds) {
                    for (const id of editorIds) {
                        if (id !== peer.id) {
                            peers.get(id)?.peer.send(message.rawData);
                        }
                    }
                }

                broadcastToWallsBinary(senderScopeKey, message.rawData);
            }
        }
    }
});

// --- GLOBAL BRIDGE FOR UPLOAD PROGRESS ---
process.__BROADCAST_EDITORS__ = (data) => {
    const payload = JSON.stringify(data);
    for (const { peer: p, meta } of peers.values()) {
        if (meta.specimen === 'editor') {
            p.send(payload);
        }
    }
};

// --- VSYNC LOOP FOR PERIODIC VIDEO ALIGNMENT ---
if (process.__VSYNC_INTERVAL__) clearInterval(process.__VSYNC_INTERVAL__);
process.__VSYNC_INTERVAL__ = setInterval(() => {
    const now = Date.now();

    for (const [, scope] of scopedState) {
        for (const [id, layer] of scope.layers.entries()) {
            if (layer?.type === 'video' && layer.playback && layer.playback.status === 'playing') {
                const duration = layer.duration;
                if (duration <= 0) continue;

                const elapsed = Math.max(0, (now - layer.playback.anchorServerTime) / 1000);
                const expected = layer.playback.anchorMediaTime + elapsed;

                if (expected >= duration) {
                    const scopeKey = makeScopeKey(scope.projectId, scope.slideId);
                    if (layer.loop ?? true) {
                        layer.playback.anchorMediaTime = !duration ? 0 : expected % duration;
                        layer.playback.anchorServerTime = now;
                    } else {
                        layer.playback.status = 'paused';
                        layer.playback.anchorMediaTime = duration;
                        layer.playback.anchorServerTime = 0;
                    }

                    broadcastToScope(scopeKey, {
                        type: 'video_sync',
                        numericId: id,
                        playback: layer.playback
                    });
                }
            }
        }
    }
}, 500);

// --- AUTO-SAVE TIMER (Bus-side, 30s interval) ---
const AUTO_SAVE_INTERVAL = 30_000;

if (process.__AUTO_SAVE_INTERVAL__) clearInterval(process.__AUTO_SAVE_INTERVAL__);
process.__AUTO_SAVE_INTERVAL__ = setInterval(() => {
    for (const [scopeKey, scope] of scopedState) {
        if (scope.dirty) {
            console.log(`[Bus] Auto-saving scope ${scopeKey}`);
            saveScope(scopeKey, 'Auto-save', true).then((result) => {
                if (result.success) {
                    broadcastToEditors(scopeKey, {
                        type: 'stage_save_response',
                        success: true,
                        commitId: result.commitId
                    });
                } else {
                    console.error(`[Bus] Auto-save failed for scope ${scopeKey}:`, result.error);
                }
            });
        }
    }
}, AUTO_SAVE_INTERVAL);

// --- VITE HMR DEFENSE STRATEGY ---
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        if (process.__VSYNC_INTERVAL__) clearInterval(process.__VSYNC_INTERVAL__);
        if (process.__AUTO_SAVE_INTERVAL__) clearInterval(process.__AUTO_SAVE_INTERVAL__);
    });
}
