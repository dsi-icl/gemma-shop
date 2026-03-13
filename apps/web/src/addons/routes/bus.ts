import { db } from '@repo/db';
import type { Peer } from 'crossws';
import { ObjectId } from 'mongodb';
import { defineWebSocketHandler } from 'nitro/h3';

import {
    GSMessageSchema,
    makeScopeKey,
    type GSMessage,
    type Layer,
    type ScopeKey,
    type ScopeState
} from '~/lib/types';

// ── Peer metadata ────────────────────────────────────────────────────────────
interface PeerMeta {
    specimen: 'wall' | 'editor' | 'roy';
    scopeKey: ScopeKey | null;
    projectId: string | null;
    slideId: string | null;
}

const peerMeta = new Map<string, PeerMeta>();

// ── Client connection pools ──────────────────────────────────────────────────
const wallClients = new Set<Peer>();
const editorClients = new Set<Peer>();

// ── Scope-keyed stage state (HMR-safe) ───────────────────────────────────────
const scopedState: Map<ScopeKey, ScopeState> =
    process.__SCOPED_STAGE_STATE__ ?? new Map<ScopeKey, ScopeState>();
process.__SCOPED_STAGE_STATE__ = scopedState;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getOrCreateScope(scopeKey: ScopeKey, projectId: string, slideId: string): ScopeState {
    let scope = scopedState.get(scopeKey);
    if (!scope) {
        scope = { layers: new Map(), projectId, slideId, dirty: false };
        scopedState.set(scopeKey, scope);
    }
    return scope;
}

function editorsInScope(scopeKey: ScopeKey): Peer[] {
    const peers: Peer[] = [];
    for (const client of editorClients) {
        const meta = peerMeta.get(client.id);
        if (meta?.scopeKey === scopeKey) peers.push(client);
    }
    return peers;
}

function broadcastJSON(data: GSMessage, clients: Set<Peer>) {
    const payload = JSON.stringify(data);
    for (const client of clients) {
        client.send(payload);
    }
}

function broadcastOtherOnlyJSON(data: GSMessage, clients: Iterable<Peer>, peer: Peer) {
    const payload = JSON.stringify(data);
    for (const client of clients) {
        if (client !== peer) client.send(payload);
    }
}

function broadcastToScope(data: GSMessage, scopeKey: ScopeKey, excludePeer?: Peer) {
    const payload = JSON.stringify(data);
    // Editors in this scope
    for (const client of editorClients) {
        if (client === excludePeer) continue;
        const meta = peerMeta.get(client.id);
        if (meta?.scopeKey === scopeKey) client.send(payload);
    }
    // All wall clients (walls are unscoped for now)
    for (const client of wallClients) {
        if (client === excludePeer) continue;
        client.send(payload);
    }
}

// ── Save to MongoDB ──────────────────────────────────────────────────────────

async function buildSlidesSnapshot(
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

async function saveScope(
    scopeKey: ScopeKey,
    message: string,
    isAutoSave: boolean
): Promise<{ success: boolean; commitId?: string; error?: string }> {
    const scope = scopedState.get(scopeKey);
    if (!scope) return { success: false, error: 'Scope not found' };

    const projectId = new ObjectId(scope.projectId);

    try {
        const project = await db.collection('projects').findOne({ _id: projectId });
        if (!project) return { success: false, error: 'Project not found' };

        const headId = project.headCommitId ? new ObjectId(project.headCommitId) : null;
        const updatedSlides = await buildSlidesSnapshot(scope, headId);

        if (isAutoSave) {
            // Auto-save: upsert a single draft commit sitting on top of head.
            // This never moves headCommitId — it's a recoverable working snapshot.
            const filter = {
                projectId,
                isAutoSave: true,
                ...(headId ? { parentId: headId } : { parentId: null })
            };

            await db.collection('commits').updateOne(
                filter,
                {
                    $set: {
                        message,
                        content: { slides: updatedSlides },
                        isAutoSave: true,
                        updatedAt: new Date()
                    },
                    $setOnInsert: {
                        projectId,
                        parentId: headId,
                        authorId: new ObjectId(), // TODO: session user
                        createdAt: new Date()
                    }
                },
                { upsert: true }
            );

            scope.dirty = false;
            return { success: true };
        }

        // Manual save: create a new commit node and advance headCommitId.
        const newCommit = {
            projectId,
            parentId: headId,
            authorId: new ObjectId(), // TODO: session user
            message,
            content: { slides: updatedSlides },
            isAutoSave: false,
            createdAt: new Date()
        };

        const result = await db.collection('commits').insertOne(newCommit);

        await db
            .collection('projects')
            .updateOne(
                { _id: projectId },
                { $set: { headCommitId: result.insertedId, updatedAt: new Date() } }
            );

        // Clean up the auto-save draft that was sitting on the old head — it's
        // now superseded by this manual commit.
        if (headId) {
            await db.collection('commits').deleteMany({
                projectId,
                isAutoSave: true,
                parentId: headId
            });
        }

        scope.dirty = false;
        return { success: true, commitId: result.insertedId.toHexString() };
    } catch (err) {
        console.error('[Bus] saveScope failed:', err);
        return { success: false, error: String(err) };
    }
}

// ── WebSocket Handler ────────────────────────────────────────────────────────

export default defineWebSocketHandler({
    open(peer) {
        peer.websocket.binaryType = 'arraybuffer';
        console.log(`[WS] Peer ${peer.id} connected`);
    },

    close(peer) {
        wallClients.delete(peer);
        editorClients.delete(peer);
        peerMeta.delete(peer.id);
        console.log(
            `[WS] Peer disconnected. Walls: ${wallClients.size} | Editors: ${editorClients.size}`
        );
    },

    message(peer, message) {
        // --- 1. JSON SLOW-PATH & HANDSHAKE ---
        if (message.rawData instanceof Buffer) {
            try {
                const data = GSMessageSchema.parse(message.json());
                const meta = peerMeta.get(peer.id);
                const scopeKey = meta?.scopeKey ?? null;

                // A. Handshake & Hydration
                if (data.type === 'hello') {
                    const newMeta: PeerMeta = {
                        specimen: data.specimen,
                        scopeKey: null,
                        projectId: data.projectId ?? null,
                        slideId: data.slideId ?? null
                    };

                    if (data.specimen === 'wall') {
                        wallClients.add(peer);
                    } else if (data.specimen === 'editor') {
                        editorClients.add(peer);

                        // Join scope if projectId and slideId provided
                        if (data.projectId && data.slideId) {
                            const sk = makeScopeKey(data.projectId, data.slideId);
                            newMeta.scopeKey = sk;
                            const scope = getOrCreateScope(sk, data.projectId, data.slideId);

                            // Hydrate the editor with scope state
                            peer.send(
                                JSON.stringify({
                                    type: 'hydrate',
                                    layers: Array.from(scope.layers.values())
                                })
                            );
                        }
                    }

                    peerMeta.set(peer.id, newMeta);

                    console.log(
                        `[WS] Handshake complete (${data.specimen}${newMeta.scopeKey ? ` scope=${newMeta.scopeKey}` : ''}). Walls: ${wallClients.size} | Editors: ${editorClients.size}`
                    );

                    // Walls get hydrated with... nothing for now (they'll get layers when assigned)
                    if (data.specimen === 'wall') {
                        peer.send(JSON.stringify({ type: 'hydrate', layers: [] }));
                    }
                    return;
                }

                if (data.type === 'rehydrate_please') {
                    if (scopeKey) {
                        const scope = scopedState.get(scopeKey);
                        if (scope) {
                            peer.send(
                                JSON.stringify({
                                    type: 'hydrate',
                                    layers: Array.from(scope.layers.values())
                                })
                            );
                        }
                    }
                    return;
                }

                if (data.type === 'clear_stage') {
                    if (scopeKey) {
                        const scope = scopedState.get(scopeKey);
                        if (scope) {
                            scope.layers.clear();
                            scope.dirty = true;
                        }
                        broadcastToScope({ type: 'hydrate', layers: [] }, scopeKey, peer);
                    } else {
                        // Legacy: wall-originated clear (clear all scopes? or no-op)
                        const hydratePayload = JSON.stringify({ type: 'hydrate', layers: [] });
                        wallClients.forEach((c) => c.send(hydratePayload));
                    }
                    return;
                }

                // C. Layer Upsert
                if (data.type === 'upsert_layer') {
                    const { layer } = data;
                    if (layer.type === 'video' && !layer.playback) {
                        layer.playback = {
                            status: 'paused',
                            anchorMediaTime: 0,
                            anchorServerTime: 0
                        };
                    }

                    // Update scoped state
                    if (scopeKey) {
                        const scope = scopedState.get(scopeKey);
                        if (scope) {
                            scope.layers.set(layer.numericId, layer);
                            scope.dirty = true;
                        }
                        broadcastToScope(data, scopeKey, peer);
                    } else {
                        // Legacy unscoped relay (wall clients)
                        broadcastOtherOnlyJSON(data, wallClients, peer);
                        broadcastOtherOnlyJSON(data, editorClients, peer);
                    }
                    return;
                }

                // C.bis Delete Layer
                if (data.type === 'delete_layer') {
                    if (scopeKey) {
                        const scope = scopedState.get(scopeKey);
                        if (scope) {
                            scope.layers.delete(data.numericId);
                            scope.dirty = true;
                        }
                        broadcastToScope(data, scopeKey, peer);
                    } else {
                        broadcastOtherOnlyJSON(data, wallClients, peer);
                        broadcastOtherOnlyJSON(data, editorClients, peer);
                    }
                    return;
                }

                if (data.type === 'reboot') {
                    broadcastOtherOnlyJSON(data, wallClients, peer);
                    return;
                }

                // ── Save pipeline ────────────────────────────────────────────
                if (data.type === 'stage_dirty') {
                    if (scopeKey) {
                        const scope = scopedState.get(scopeKey);
                        if (scope) scope.dirty = true;
                    }
                    return;
                }

                if (data.type === 'stage_save') {
                    if (!scopeKey) {
                        peer.send(
                            JSON.stringify({
                                type: 'stage_save_response',
                                success: false,
                                error: 'Not in a scope'
                            })
                        );
                        return;
                    }

                    // Async save — respond when done
                    saveScope(scopeKey, data.message, data.isAutoSave ?? false).then((result) => {
                        const response: GSMessage = {
                            type: 'stage_save_response',
                            success: result.success,
                            commitId: result.commitId,
                            error: result.error
                        };
                        peer.send(JSON.stringify(response));

                        // Notify other editors in scope
                        if (result.success) {
                            for (const other of editorsInScope(scopeKey)) {
                                if (other !== peer) {
                                    other.send(JSON.stringify(response));
                                }
                            }
                        }
                    });
                    return;
                }

                // D. Playback Controls (The Anchor State Machine)
                if (data.type === 'video_play') {
                    const layer = scopeKey
                        ? scopedState.get(scopeKey)?.layers.get(data.numericId)
                        : undefined;
                    if (layer?.type === 'video') {
                        layer.playback.status = 'playing';
                        layer.playback.anchorServerTime = Date.now() + 500;

                        const syncPayload: GSMessage = {
                            type: 'video_sync',
                            numericId: data.numericId,
                            playback: layer.playback
                        };
                        if (scopeKey) {
                            broadcastToScope(syncPayload, scopeKey);
                        } else {
                            broadcastJSON(syncPayload, wallClients);
                            broadcastJSON(syncPayload, editorClients);
                        }
                    }
                    return;
                }

                if (data.type === 'video_pause') {
                    const layer = scopeKey
                        ? scopedState.get(scopeKey)?.layers.get(data.numericId)
                        : undefined;
                    if (layer?.type === 'video' && layer.playback.status === 'playing') {
                        let elapsed = (Date.now() - layer.playback.anchorServerTime) / 1000;
                        if (elapsed < 0) elapsed = 0;

                        layer.playback.status = 'paused';
                        layer.playback.anchorMediaTime += elapsed;
                        layer.playback.anchorServerTime = 0;

                        const syncPayload: GSMessage = {
                            type: 'video_sync',
                            numericId: data.numericId,
                            playback: layer.playback
                        };
                        if (scopeKey) {
                            broadcastToScope(syncPayload, scopeKey);
                        } else {
                            broadcastJSON(syncPayload, wallClients);
                            broadcastJSON(syncPayload, editorClients);
                        }
                    }
                    return;
                }

                if (data.type === 'video_seek') {
                    const layer = scopeKey
                        ? scopedState.get(scopeKey)?.layers.get(data.numericId)
                        : undefined;
                    if (layer?.type === 'video') {
                        layer.playback.status = 'paused';
                        layer.playback.anchorMediaTime = data.mediaTime;
                        layer.playback.anchorServerTime = 0;

                        const syncPayload: GSMessage = {
                            type: 'video_sync',
                            numericId: data.numericId,
                            playback: layer.playback
                        };
                        if (scopeKey) {
                            broadcastToScope(syncPayload, scopeKey);
                        } else {
                            broadcastJSON(syncPayload, wallClients);
                            broadcastJSON(syncPayload, editorClients);
                        }
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

            // B. Relay Spatial Moves — scoped to same-scope editors + all walls
            if (opcode === 0x05) {
                const senderMeta = peerMeta.get(peer.id);
                const senderScope = senderMeta?.scopeKey;

                // Send to all wall clients
                for (const client of wallClients) {
                    client.send(message.rawData);
                }

                // Send to editors in same scope only
                if (senderScope) {
                    for (const client of editorClients) {
                        if (client !== peer) {
                            const clientMeta = peerMeta.get(client.id);
                            if (clientMeta?.scopeKey === senderScope) {
                                client.send(message.rawData);
                            }
                        }
                    }
                } else {
                    // Legacy: broadcast to all editors
                    for (const client of editorClients) {
                        if (client !== peer) {
                            client.send(message.rawData);
                        }
                    }
                }
            }
        }
    }
});

// --- GLOBAL BRIDGE FOR UPLOAD PROGRESS ---
process.__BROADCAST_EDITORS__ = (data) => {
    const payload = JSON.stringify(data);
    for (const client of editorClients) {
        client.send(payload);
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

                        const syncPayload: GSMessage = {
                            type: 'video_sync',
                            numericId: id,
                            playback: layer.playback
                        };
                        broadcastToScope(syncPayload, scopeKey);
                    } else {
                        layer.playback.status = 'paused';
                        layer.playback.anchorMediaTime = duration;
                        layer.playback.anchorServerTime = 0;

                        const syncPayload: GSMessage = {
                            type: 'video_sync',
                            numericId: id,
                            playback: layer.playback
                        };
                        broadcastToScope(syncPayload, scopeKey);
                    }
                }
            }
        }
    }
}, 500);

// --- AUTO-SAVE TIMER (Bus-side, 30s interval) ---
const AUTO_SAVE_INTERVAL = 30_000;

if (process.__AUTO_SAVE_INTERVAL__) clearInterval(process.__AUTO_SAVE_INTERVAL__);
process.__AUTO_SAVE_INTERVAL__ = setInterval(() => {
    console.log('[Bus] Auto-save triggered', scopedState);
    for (const [scopeKey, scope] of scopedState) {
        if (scope.dirty) {
            console.log(`[Bus] Auto-saving scope ${scopeKey}`);
            saveScope(scopeKey, 'Auto-save', true).then((result) => {
                if (result.success) {
                    // Notify editors in this scope about the auto-save
                    const response: GSMessage = {
                        type: 'stage_save_response',
                        success: true,
                        commitId: result.commitId
                    };
                    const payload = JSON.stringify(response);
                    for (const client of editorsInScope(scopeKey)) {
                        client.send(payload);
                    }
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
