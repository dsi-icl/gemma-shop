import { db } from '@repo/db';
import { ObjectId } from 'mongodb';
import { defineWebSocketHandler } from 'nitro/h3';

import {
    peers,
    scopedState,
    wallBindings,
    wallBindingSources,
    wallsByWallId,
    editorsByScope,
    allEditors,
    activeVideos,
    registerPeer,
    unregisterPeer,
    getOrCreateScope,
    internScope,
    scopeLabel,
    bindWall,
    scheduleWallUnbindGrace,
    unbindWall,
    sendJSON,
    broadcastToEditors,
    broadcastToControllersByScopeRaw,
    broadcastToWallsBinary,
    broadcastToControllersByWallRaw,
    broadcastToScope,
    broadcastToScopeRaw,
    broadcastToWallNodesRaw,
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
    clearControllerTransientForScope,
    deleteControllerTransientLayerForScope,
    deleteControllerTransientLayer,
    invalidateHydrateCache,
    getEditorHydratePayload,
    getWallHydratePayload,
    upsertControllerTransientLayer,
    cancelWallUnbindGrace,
    touchPing,
    reapStalePeers,
    persistSlideMetadata,
    deleteYDocForLayer,
    broadcastToEditorsByCommit,
    notifyControllersByCommit,
    broadcastAssetToEditorsByProject,
    getWallNodeCount,
    markIncomingBinary,
    markIncomingJson,
    estimatePlaybackLeadMs,
    // layerNodes,
    // canSendNonCritical,
    EMPTY_HYDRATE,
    type PeerEntry
} from '~/lib/busState';
import {
    HelloSchema,
    GSMessageSchema,
    makeScopeLabel,
    type GSMessage,
    type Layer
} from '~/lib/types';

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

function toArrayBufferView(data: Uint8Array | Buffer): ArrayBuffer {
    const out = new Uint8Array(data.byteLength);
    out.set(data);
    return out.buffer;
}

function firstNonWhitespaceByte(data: Uint8Array): number | null {
    for (let i = 0; i < data.byteLength; i++) {
        const c = data[i];
        // ASCII whitespace: tab, lf, cr, space
        if (c === 0x09 || c === 0x0a || c === 0x0d || c === 0x20) continue;
        return c;
    }
    return null;
}

interface HandlerCtx {
    entry: PeerEntry;
    data: Record<string, any>;
    scopeId: number | null;
    rawText: string;
}

type Handler = (ctx: HandlerCtx) => void;

const handlers = new Map<string, Handler>();
const lastPlaybackCommandAt = new Map<string, number>();

function playbackCommandKey(scopeId: number, numericId: number): string {
    return `${scopeId}:${numericId}`;
}

function shouldApplyPlaybackCommand(
    scopeId: number,
    numericId: number,
    issuedAt: unknown
): boolean {
    const now = Date.now();
    const fromClient = typeof issuedAt === 'number' && Number.isFinite(issuedAt) ? issuedAt : null;
    // Protect against cross-device clock skew: trust client timestamp only if it is near server now.
    const stamp = fromClient !== null && Math.abs(fromClient - now) <= 15_000 ? fromClient : now;
    const key = playbackCommandKey(scopeId, numericId);
    const prev = lastPlaybackCommandAt.get(key);
    if (prev !== undefined && stamp < prev) return false;
    lastPlaybackCommandAt.set(key, stamp);
    return true;
}

function clearPlaybackCommand(scopeId: number, numericId: number) {
    lastPlaybackCommandAt.delete(playbackCommandKey(scopeId, numericId));
}

function broadcastWallNodeCountToEditors(wallId: string) {
    const payload = JSON.stringify({
        type: 'wall_node_count',
        wallId,
        connectedNodes: getWallNodeCount(wallId)
    } satisfies GSMessage);
    for (const entry of allEditors) {
        entry.peer.send(payload);
    }
}

function syncWallNodeCountToDb(wallId: string) {
    const connectedNodes = getWallNodeCount(wallId);
    const hasLiveBinding = wallBindings.has(wallId);
    void db.collection('walls').updateOne(
        { wallId },
        {
            $set: {
                connectedNodes,
                lastSeen: new Date().toISOString(),
                ...(!hasLiveBinding
                    ? {
                          boundProjectId: null,
                          boundCommitId: null,
                          boundSlideId: null,
                          boundSource: null
                      }
                    : {})
            },
            $setOnInsert: {
                wallId,
                name: wallId,
                createdAt: new Date().toISOString()
            }
        },
        { upsert: true }
    );
}

async function resolveBoundSlideId(
    projectId: string,
    commitId: string,
    requestedSlideId: string
): Promise<string | null> {
    let commit: any = null;
    try {
        commit = await db
            .collection('commits')
            .findOne(
                { _id: new ObjectId(commitId), projectId: new ObjectId(projectId) },
                { projection: { 'content.slides.id': 1 } }
            );
    } catch {
        return null;
    }
    if (!commit) return null;
    const slides = (commit.content?.slides as Array<{ id?: string }>) ?? [];
    if (slides.some((s) => s.id === requestedSlideId)) return requestedSlideId;
    return slides[0]?.id ?? null;
}

function broadcastWallBindingToEditors(wallId: string) {
    const boundScope = wallBindings.get(wallId);
    const scope = boundScope !== undefined ? scopedState.get(boundScope) : null;
    const payload = JSON.stringify({
        type: 'wall_binding_status',
        wallId,
        bound: boundScope !== undefined,
        ...(scope
            ? { projectId: scope.projectId, commitId: scope.commitId, slideId: scope.slideId }
            : {})
    } satisfies GSMessage);
    for (const entry of allEditors) {
        entry.peer.send(payload);
    }
}

handlers.set('rehydrate_please', ({ entry }) => {
    const { meta } = entry;

    if (meta.specimen === 'editor') {
        entry.peer.send(getEditorHydratePayload(meta.scopeId));
    } else if (meta.specimen === 'wall') {
        const boundScope = wallBindings.get(meta.wallId);
        entry.peer.send(
            boundScope !== undefined
                ? getWallHydratePayload(boundScope, meta.wallId)
                : EMPTY_HYDRATE
        );
    } else if (meta.specimen === 'controller') {
        const boundScope = wallBindings.get(meta.wallId);
        entry.peer.send(
            boundScope !== undefined
                ? getWallHydratePayload(boundScope, meta.wallId)
                : EMPTY_HYDRATE
        );
    }
});

handlers.set('clear_stage', ({ entry, scopeId }) => {
    if (scopeId === null) return;
    const scope = scopedState.get(scopeId);
    if (scope) {
        for (const numericId of scope.layers.keys()) {
            clearPlaybackCommand(scopeId, numericId);
        }
        scope.layers.clear();
        scope.dirty = true;
    }
    clearActiveVideosForScope(scopeId);
    clearControllerTransientForScope(scopeId);
    // clearLayerNodesForScope(scopeId);
    invalidateHydrateCache(scopeId);
    const clearPayload = { type: 'hydrate', layers: [] } satisfies GSMessage;
    broadcastToScope(scopeId, clearPayload, entry);
    broadcastToControllersByScopeRaw(scopeId, JSON.stringify(clearPayload));
});

handlers.set('upsert_layer', ({ entry, data, scopeId, rawText }) => {
    let layer = data.layer;
    if (typeof layer?.numericId !== 'number') return;

    const isControllerTransientUpsert = data.origin === 'controller:add_line_layer';
    let relayPayload = rawText;

    if (scopeId !== null) {
        const scope = scopedState.get(scopeId);
        if (scope) {
            if (isControllerTransientUpsert) {
                // Controller drawings are transient wall overlays: no DB persistence and no editor fanout.
                if (entry.meta.specimen !== 'controller') return;
                upsertControllerTransientLayer(entry.meta.wallId, layer);
            } else {
                // Playback timeline is authoritative via video_play/pause/seek handlers.
                // Generic upsert_layer must never override live playback state.
                if (layer.type === 'video') {
                    const existing = scope.layers.get(layer.numericId);
                    if (existing?.type === 'video' && existing.playback) {
                        layer = { ...layer, playback: existing.playback };
                        relayPayload = JSON.stringify({ ...data, layer });
                    } else if (!layer.playback) {
                        layer = {
                            ...layer,
                            playback: {
                                status: 'paused',
                                anchorMediaTime: 0,
                                anchorServerTime: 0
                            }
                        };
                        relayPayload = JSON.stringify({ ...data, layer });
                    }
                }
                scope.layers.set(layer.numericId, layer);
                scope.dirty = true;
                invalidateHydrateCache(scopeId);
            }
        }
        // recomputeLayerNodes(layer.numericId, layer, scopeId);
        if (isControllerTransientUpsert) {
            if (entry.meta.specimen !== 'controller') return;
            broadcastToWallNodesRaw(entry.meta.wallId, relayPayload);
            broadcastToControllersByWallRaw(entry.meta.wallId, relayPayload, entry);
        } else {
            broadcastToScopeRaw(scopeId, relayPayload, entry);
        }
    }
});

handlers.set('delete_layer', ({ entry, data, scopeId, rawText }) => {
    if (scopeId === null) return;
    const isControllerTransientDelete = data.origin === 'controller:add_line_layer';
    const scope = scopedState.get(scopeId);
    let deletedPersistentLayer = false;
    let deletedControllerTransient = false;

    if (scope) {
        if (isControllerTransientDelete) {
            if (entry.meta.specimen !== 'controller') return;
            deletedControllerTransient = deleteControllerTransientLayer(
                entry.meta.wallId,
                data.numericId
            );
        } else {
            deletedPersistentLayer = scope.layers.delete(data.numericId);
            if (deletedPersistentLayer) {
                clearPlaybackCommand(scopeId, data.numericId);
                scope.dirty = true;
                deleteYDocForLayer(scopeId, data.numericId);
            }
            deletedControllerTransient = deleteControllerTransientLayerForScope(
                scopeId,
                data.numericId
            );
            invalidateHydrateCache(scopeId);
        }
    }

    if (deletedPersistentLayer) {
        unregisterActiveVideo(data.numericId);
    }
    // deleteLayerNodes(data.numericId);
    if (isControllerTransientDelete || (deletedControllerTransient && !deletedPersistentLayer)) {
        if (entry.meta.specimen !== 'controller') return;
        broadcastToWallNodesRaw(entry.meta.wallId, rawText);
        broadcastToControllersByWallRaw(entry.meta.wallId, rawText, entry);
    } else {
        broadcastToScopeRaw(scopeId, rawText, entry);
    }
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
    clearControllerTransientForScope(scopeId);
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

handlers.set('update_slides', ({ entry, data }) => {
    const { commitId, slides } = data;
    if (!commitId || !Array.isArray(slides)) return;

    // Persist metadata to DB (no layer changes)
    persistSlideMetadata(commitId, slides).then((ok) => {
        if (!ok) {
            console.error(`[Bus] Failed to persist slide metadata for commit ${commitId}`);
            return;
        }

        // Broadcast slides_updated to all editors + controllers on this commit
        const payload = JSON.stringify({ type: 'slides_updated', commitId, slides });
        broadcastToEditorsByCommit(commitId, payload, entry);
        notifyControllersByCommit(commitId, payload);
    });
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
    void (async () => {
        try {
            cancelWallUnbindGrace(data.wallId);
            const [resolvedSlideId, project] = await Promise.all([
                resolveBoundSlideId(data.projectId, data.commitId, data.slideId),
                db
                    .collection('projects')
                    .findOne(
                        { _id: new ObjectId(data.projectId) },
                        { projection: { customRenderUrl: 1, customRenderCompat: 1 } }
                    )
            ]);
            if (!resolvedSlideId) {
                console.warn(
                    `[WS] Refusing bind_wall for ${data.wallId}: no valid slide for ${makeScopeLabel(data.projectId, data.commitId, data.slideId)}`
                );
                return;
            }

            const scopeId = internScope(data.projectId, data.commitId, resolvedSlideId);
            const scope = getOrCreateScope(
                scopeId,
                data.projectId,
                data.commitId,
                resolvedSlideId,
                project?.customRenderUrl,
                project?.customRenderCompat
            );
            bindWall(data.wallId, scopeId, 'live');

            if (scope.layers.size === 0) {
                // Fresh scope — auto-seed from DB before hydrating walls
                await seedScopeFromDb(scopeId);
            }

            // Keep control-plane updates resilient even if hydrate throws.
            notifyControllers(data.wallId, true, data.projectId, data.commitId, resolvedSlideId);
            try {
                hydrateWallNodes(data.wallId);
            } catch (err) {
                console.error(
                    `[WS] bind_wall hydrate failed for ${data.wallId} (${makeScopeLabel(data.projectId, data.commitId, resolvedSlideId)}):`,
                    err
                );
            }

            await db.collection('walls').updateOne(
                { wallId: data.wallId },
                {
                    $set: {
                        boundProjectId: data.projectId,
                        boundCommitId: data.commitId,
                        boundSlideId: resolvedSlideId,
                        boundSource: 'live',
                        updatedAt: new Date().toISOString()
                    },
                    $setOnInsert: {
                        wallId: data.wallId,
                        name: data.wallId,
                        createdAt: new Date().toISOString()
                    }
                },
                { upsert: true }
            );

            broadcastWallBindingToEditors(data.wallId);
            broadcastWallNodeCountToEditors(data.wallId);

            console.log(
                `[WS] Wall ${data.wallId} bound to scope=${makeScopeLabel(data.projectId, data.commitId, resolvedSlideId)}`
            );
        } catch (err) {
            console.error(
                `[WS] bind_wall failed for ${data.wallId} (${makeScopeLabel(data.projectId, data.commitId, data.slideId)}):`,
                err
            );
        }
    })();
});

handlers.set('unbind_wall', ({ data }) => {
    cancelWallUnbindGrace(data.wallId);
    unbindWall(data.wallId);
    hydrateWallNodes(data.wallId);
    broadcastToControllersByWallRaw(
        data.wallId,
        JSON.stringify({ type: 'hydrate', layers: [] } satisfies GSMessage)
    );
    notifyControllers(data.wallId, false);
    void db.collection('walls').updateOne(
        { wallId: data.wallId },
        {
            $set: {
                boundProjectId: null,
                boundCommitId: null,
                boundSlideId: null,
                boundSource: null,
                updatedAt: new Date().toISOString()
            }
        }
    );
    broadcastWallBindingToEditors(data.wallId);
    broadcastWallNodeCountToEditors(data.wallId);
    console.log(`[WS] Wall ${data.wallId} unbound`);
});

handlers.set('video_play', ({ data, scopeId }) => {
    if (scopeId === null) return;
    if (!shouldApplyPlaybackCommand(scopeId, data.numericId, data.issuedAt)) return;
    const layer = scopedState.get(scopeId)?.layers.get(data.numericId);
    if (layer?.type === 'video') {
        const leadMs = estimatePlaybackLeadMs(scopeId);
        layer.playback.status = 'playing';
        layer.playback.anchorServerTime = Date.now() + leadMs;
        registerActiveVideo(data.numericId, scopeId, layer);
        sendVideoSyncToRelevantWalls(data.numericId, scopeId, layer.playback, {
            criticalToWalls: true
        });
    }
});

handlers.set('video_pause', ({ data, scopeId }) => {
    if (scopeId === null) return;
    if (!shouldApplyPlaybackCommand(scopeId, data.numericId, data.issuedAt)) return;
    const layer = scopedState.get(scopeId)?.layers.get(data.numericId);
    if (layer?.type === 'video' && layer.playback.status === 'playing') {
        let elapsed = (Date.now() - layer.playback.anchorServerTime) / 1000;
        if (elapsed < 0) elapsed = 0;

        layer.playback.status = 'paused';
        layer.playback.anchorMediaTime += elapsed;
        layer.playback.anchorServerTime = 0;

        unregisterActiveVideo(data.numericId);
        sendVideoSyncToRelevantWalls(data.numericId, scopeId, layer.playback, {
            criticalToWalls: true
        });
    }
});

handlers.set('video_seek', ({ data, scopeId }) => {
    if (scopeId === null) return;
    if (!shouldApplyPlaybackCommand(scopeId, data.numericId, data.issuedAt)) return;
    const layer = scopedState.get(scopeId)?.layers.get(data.numericId);
    if (layer?.type === 'video') {
        layer.playback.status = 'paused';
        layer.playback.anchorMediaTime = data.mediaTime;
        layer.playback.anchorServerTime = 0;

        unregisterActiveVideo(data.numericId);
        sendVideoSyncToRelevantWalls(data.numericId, scopeId, layer.playback, {
            criticalToWalls: true
        });
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
                peer.send(getEditorHydratePayload(scopeId));
                for (const wallId of wallsByWallId.keys()) {
                    peer.send(
                        JSON.stringify({
                            type: 'wall_node_count',
                            wallId,
                            connectedNodes: getWallNodeCount(wallId)
                        } satisfies GSMessage)
                    );
                    const boundScope = wallBindings.get(wallId);
                    const bound = boundScope !== undefined;
                    const s = bound ? scopedState.get(boundScope) : null;
                    peer.send(
                        JSON.stringify({
                            type: 'wall_binding_status',
                            wallId,
                            bound,
                            ...(s
                                ? {
                                      projectId: s.projectId,
                                      commitId: s.commitId,
                                      slideId: s.slideId
                                  }
                                : {})
                        } satisfies GSMessage)
                    );
                }
            });
        } else {
            peer.send(getEditorHydratePayload(scopeId));
            for (const wallId of wallsByWallId.keys()) {
                peer.send(
                    JSON.stringify({
                        type: 'wall_node_count',
                        wallId,
                        connectedNodes: getWallNodeCount(wallId)
                    } satisfies GSMessage)
                );
                const boundScope = wallBindings.get(wallId);
                const bound = boundScope !== undefined;
                const s = bound ? scopedState.get(boundScope) : null;
                peer.send(
                    JSON.stringify({
                        type: 'wall_binding_status',
                        wallId,
                        bound,
                        ...(s
                            ? {
                                  projectId: s.projectId,
                                  commitId: s.commitId,
                                  slideId: s.slideId
                              }
                            : {})
                    } satisfies GSMessage)
                );
            }
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

        peer.send(
            boundScope !== undefined
                ? getWallHydratePayload(boundScope, parsed.wallId)
                : EMPTY_HYDRATE
        );

        // if (boundScope !== undefined) recomputeAllLayerNodes(boundScope);
        broadcastWallNodeCountToEditors(parsed.wallId);
        broadcastWallBindingToEditors(parsed.wallId);
        syncWallNodeCountToDb(parsed.wallId);

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
        peer.send(
            boundScope !== undefined
                ? getWallHydratePayload(boundScope, parsed.wallId)
                : EMPTY_HYDRATE
        );

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
    markIncomingBinary();
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

        // Relay to walls: currently broadcasts to all walls in scope.
        // AABB spatial filtering is disabled because the layerNodes pre-computation
        // created consistency issues during rapid layer mutations — walls could miss moves for
        // layers that weren't yet registered in their node set. Re-enable for large deployments
        // (100+ walls) once layerNodes tracking is stabilised and tested under concurrent edits.
        //
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
        const meta = unregisterPeer(peer.id);
        if (meta?.specimen === 'editor') {
            const remainingEditors = editorsByScope.get(meta.scopeId)?.size ?? 0;
            if (remainingEditors <= 0) {
                for (const [wallId, boundScopeId] of wallBindings) {
                    if (boundScopeId !== meta.scopeId) continue;
                    if (wallBindingSources.get(wallId) !== 'live') continue;

                    unbindWall(wallId);
                    hydrateWallNodes(wallId);
                    broadcastToControllersByWallRaw(
                        wallId,
                        JSON.stringify({ type: 'hydrate', layers: [] } satisfies GSMessage)
                    );
                    notifyControllers(wallId, false);
                    void db.collection('walls').updateOne(
                        { wallId },
                        {
                            $set: {
                                boundProjectId: null,
                                boundCommitId: null,
                                boundSlideId: null,
                                boundSource: null,
                                updatedAt: new Date().toISOString()
                            }
                        }
                    );
                    broadcastWallBindingToEditors(wallId);
                }
            }
        }
        if (meta?.specimen === 'wall') {
            if (getWallNodeCount(meta.wallId) <= 0) {
                scheduleWallUnbindGrace(meta.wallId, () => {
                    // Wall may have reconnected during grace period.
                    if (getWallNodeCount(meta.wallId) > 0) return;

                    unbindWall(meta.wallId);
                    hydrateWallNodes(meta.wallId);
                    broadcastToControllersByWallRaw(
                        meta.wallId,
                        JSON.stringify({ type: 'hydrate', layers: [] } satisfies GSMessage)
                    );
                    notifyControllers(meta.wallId, false);
                    void db.collection('walls').updateOne(
                        { wallId: meta.wallId },
                        {
                            $set: {
                                boundProjectId: null,
                                boundCommitId: null,
                                boundSlideId: null,
                                boundSource: null,
                                updatedAt: new Date().toISOString()
                            }
                        }
                    );
                    broadcastWallBindingToEditors(meta.wallId);
                    broadcastWallNodeCountToEditors(meta.wallId);
                });
            }
            broadcastWallNodeCountToEditors(meta.wallId);
            broadcastWallBindingToEditors(meta.wallId);
            syncWallNodeCountToDb(meta.wallId);
        }
        logPeerCounts();
    },

    message(peer, message) {
        const raw = message.rawData;
        const knownPeer = peers.get(peer.id);
        if (knownPeer) {
            const specimen = knownPeer.meta.specimen;
            if (specimen === 'editor' || specimen === 'wall') {
                touchPing(peer.id);
            }
        }

        // ── Binary fast-path (ArrayBuffer) ───────────────────────────
        if (raw instanceof ArrayBuffer) {
            handleBinary(peer, raw);
            return;
        }

        // ── Mixed Buffer/Uint8Array path (text or binary) ────────────
        if (raw instanceof Buffer || raw instanceof Uint8Array) {
            const first = firstNonWhitespaceByte(raw);
            const looksLikeJson = first === 0x7b || first === 0x5b; // '{' or '['

            if (!looksLikeJson) {
                handleBinary(peer, toArrayBufferView(raw));
                return;
            }

            const rawText = message.text();

            try {
                const data = JSON.parse(rawText);
                markIncomingJson();

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
            return;
        }

        // ── JSON path (string payloads) ──────────────────────────────
        if (typeof raw === 'string') {
            try {
                const data = JSON.parse(raw);
                markIncomingJson();

                if (!hasType(data)) {
                    console.warn(`[WS] Invalid message from peer ${peer.id}: missing type`);
                    return;
                }

                if (data.type === 'hello') {
                    handleHello(peer, data);
                    return;
                }

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
                        rawText: raw
                    });
                }
            } catch (err) {
                console.error(`[WS] Unparseable string message from peer ${peer.id}:`, err);
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

// Bridge for asset uploads — broadcast asset_added to editors on the same project
(process as any).__BROADCAST_ASSET_ADDED__ = (
    projectId: string,
    asset: Record<string, unknown>
) => {
    broadcastAssetToEditorsByProject(projectId, asset);
};

// Bridge for YJS text updates — scope-targeted upsert into bus state + fanout.
(process as any).__YJS_UPSERT_LAYER__ = (payload: {
    projectId: string;
    commitId: string;
    slideId: string;
    layerId: number;
    textHtml: string;
    fallbackLayer?: Extract<Layer, { type: 'text' }>;
}) => {
    try {
        const { projectId, commitId, slideId, layerId, textHtml, fallbackLayer } = payload;
        const scopeId = internScope(projectId, commitId, slideId);
        const scope = getOrCreateScope(scopeId, projectId, commitId, slideId);

        const existing = scope.layers.get(layerId);
        const nextLayer =
            existing?.type === 'text'
                ? { ...existing, textHtml }
                : fallbackLayer
                  ? { ...fallbackLayer, textHtml }
                  : null;

        if (!nextLayer || nextLayer.type !== 'text') {
            console.warn(
                `[WS] YJS upsert ignored: text layer ${layerId} not found for scope ${makeScopeLabel(projectId, commitId, slideId)}`
            );
            return false;
        }

        scope.layers.set(layerId, nextLayer);
        scope.dirty = true;
        invalidateHydrateCache(scopeId);
        broadcastToScope(scopeId, {
            type: 'upsert_layer',
            origin: 'yjs:sync',
            layer: nextLayer
        });
        return true;
    } catch (error) {
        console.error('[WS] YJS upsert bridge failed:', error);
        return false;
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
