import type { Peer } from 'crossws';
import { defineWebSocketHandler } from 'nitro/h3';

import { GSMessageSchema, type GSMessage, type StageState } from '~/lib/types';

// Client connection pools
const wallClients = new Set<Peer>();
const editorClients = new Set<Peer>();

// The Master Stage State in memory
const stageState = process.__STAGE_STATE__ ?? ({ layers: new Map() } as StageState);
process.__STAGE_STATE__ = stageState;

function broadcastJSON(data: GSMessage, clients: Set<Peer>) {
    const payload = JSON.stringify(data);
    for (const client of clients) {
        client.send(payload);
    }
}

function broadcastOtherOnlyJSON(data: GSMessage, clients: Set<Peer>, peer: Peer) {
    const payload = JSON.stringify(data);
    for (const client of clients) {
        if (client !== peer) client.send(payload);
    }
}

export default defineWebSocketHandler({
    open(peer) {
        // We don't add them to a pool yet. We wait for the handshake.
        peer.websocket.binaryType = 'arraybuffer';
        console.log(`[WS] Peer ${peer.id} connected`);
    },

    close(peer) {
        // Safe to delete from both; Sets ignore deletion of non-existent items
        wallClients.delete(peer);
        editorClients.delete(peer);
        console.log(
            `[WS] Peer disconnected. Walls: ${wallClients.size} | Editors: ${editorClients.size}`
        );
    },

    message(peer, message) {
        // --- 1. JSON SLOW-PATH & HANDSHAKE ---
        // Using strict Buffer check to confidently intercept JSON
        if (message.rawData instanceof Buffer) {
            try {
                // Leverage crossws native JSON parsing
                const data = GSMessageSchema.parse(message.json());

                // A. Handshake & Hydration
                if (data.type === 'hello') {
                    if (data.specimen === 'wall') {
                        wallClients.add(peer);
                    } else if (data.specimen === 'editor') {
                        editorClients.add(peer);
                    }

                    console.log(
                        `[WS] Handshake complete (${data.specimen}). Walls: ${wallClients.size} | Editors: ${editorClients.size}`
                    );

                    // Hydrate the client strictly AFTER we know who they are
                    peer.send(
                        JSON.stringify({
                            type: 'hydrate',
                            layers: Array.from(stageState.layers.values())
                        })
                    );
                    return;
                }

                if (data.type === 'rehydrate_please') {
                    peer.send(
                        JSON.stringify({
                            type: 'hydrate',
                            layers: Array.from(stageState.layers.values())
                        })
                    );
                }

                if (data.type === 'clear_stage') {
                    stageState.layers.clear();
                    const hydratePayload = JSON.stringify({ type: 'hydrate', layers: [] });
                    wallClients.forEach((c) => c.send(hydratePayload));
                    editorClients.forEach((c) => c.send(hydratePayload));
                    return;
                }

                // C. Layer Setup
                if (data.type === 'upsert_layer') {
                    const { layer } = data;
                    if (layer.type === 'video' && !layer.playback) {
                        layer.playback = {
                            status: 'paused',
                            anchorMediaTime: 0,
                            anchorServerTime: 0
                        };
                    }
                    stageState.layers.set(layer.numericId, layer);

                    broadcastOtherOnlyJSON(data, wallClients, peer);
                    broadcastOtherOnlyJSON(data, editorClients, peer);
                    return;
                }

                // C.bis Layer Setup
                if (data.type === 'delete_layer') {
                    stageState.layers.delete(data.numericId);

                    broadcastOtherOnlyJSON(data, wallClients, peer);
                    broadcastOtherOnlyJSON(data, editorClients, peer);
                    return;
                }

                // C.bis Layer Setup
                if (data.type === 'reboot') {
                    broadcastOtherOnlyJSON(data, wallClients, peer);
                    return;
                }

                // D. Playback Controls (The Anchor State Machine)
                if (data.type === 'video_play') {
                    const layer = stageState.layers.get(data.numericId);
                    if (layer?.type === 'video') {
                        layer.playback.status = 'playing';
                        // 500ms delay to neutralize network travel time before frames start rolling
                        layer.playback.anchorServerTime = Date.now() + 500;

                        const syncPayload: GSMessage = {
                            type: 'video_sync',
                            numericId: data.numericId,
                            playback: layer.playback
                        };
                        broadcastJSON(syncPayload, wallClients);
                        broadcastJSON(syncPayload, editorClients);
                    }
                    return;
                }

                if (data.type === 'video_pause') {
                    const layer = stageState.layers.get(data.numericId);
                    if (layer?.type === 'video' && layer.playback.status === 'playing') {
                        // Calculate exactly where the video should be at the moment of pause
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
                        broadcastJSON(syncPayload, wallClients);
                        broadcastJSON(syncPayload, editorClients);
                    }
                    return;
                }

                if (data.type === 'video_seek') {
                    const layer = stageState.layers.get(data.numericId);
                    if (layer?.type === 'video') {
                        layer.playback.status = 'paused';
                        layer.playback.anchorMediaTime = data.mediaTime;
                        layer.playback.anchorServerTime = 0;

                        // Broadcast the seek so clients jump to the frame
                        const syncPayload: GSMessage = {
                            type: 'video_sync',
                            numericId: data.numericId,
                            playback: layer.playback
                        };
                        broadcastJSON(syncPayload, wallClients);
                        broadcastJSON(syncPayload, editorClients);
                    }
                    return;
                }
            } catch (err) {
                console.error('[WS] Failed to parse JSON message:', err);
            }
            return; // Exit the message handler so JSON isn't routed as binary
        } else if (message.rawData instanceof ArrayBuffer) {
            // --- 2. BINARY FAST-PATH (Zero-Copy Relay) ---
            // We must extract the DataView cleanly from the crossws rawData Buffer
            const view = new DataView(message.rawData);
            const opcode = view.getUint8(0);

            // A. Handle Clock Ping
            if (opcode === 0x08) {
                const t0 = view.getFloat64(1, true);
                const t1 = Date.now();
                const t2 = Date.now(); // Captured immediately after t1

                // Pack the Pong: 1 byte Opcode + 24 bytes (t0, t1, t2) = 25 bytes
                const outBuffer = new ArrayBuffer(25);
                const outView = new DataView(outBuffer);
                outView.setUint8(0, 0x09);
                outView.setFloat64(1, t0, true);
                outView.setFloat64(9, t1, true);
                outView.setFloat64(17, t2, true);

                peer.send(outBuffer);
                return; // Return early so we don't broadcast the ping to other clients!
            }

            // B. Relay Spatial Moves (Zero-Copy)
            if (opcode === 0x05) {
                for (const client of wallClients) {
                    client.send(message.rawData);
                }
                for (const client of editorClients) {
                    if (client !== peer) {
                        client.send(message.rawData);
                    }
                }
            }
        }
    }
});

// --- GLOBAL BRIDGE FOR UPLOAD PROGRESS ---
// Expose the editor broadcast function so our HTTP upload route can send FFmpeg progress
process.__BROADCAST_EDITORS__ = (data) => {
    const payload = JSON.stringify(data);
    for (const client of editorClients) {
        client.send(payload);
    }
};

// --- VSYNC LOOP FOR PERIODIC ALIGNEMENT ---
process.__VSYNC_INTERVAL__ = setInterval(() => {
    const now = Date.now();

    for (const [id, layer] of stageState.layers.entries()) {
        if (layer?.type === 'video' && layer.playback && layer.playback.status === 'playing') {
            const duration = layer.duration;
            if (duration <= 0) continue;

            // Calculate the true server time
            const elapsed = Math.max(0, (now - layer.playback.anchorServerTime) / 1000);
            const expected = layer.playback.anchorMediaTime + elapsed;

            if (expected >= duration) {
                if (layer.loop ?? true) {
                    // SERVER DECIDES TO LOOP
                    layer.playback.anchorMediaTime = !duration ? 0 : expected % duration;
                    layer.playback.anchorServerTime = now;

                    const syncPayload: GSMessage = {
                        type: 'video_sync',
                        numericId: id,
                        playback: layer.playback
                    };
                    broadcastJSON(syncPayload, wallClients);
                    broadcastJSON(syncPayload, editorClients);
                } else {
                    // SERVER DECIDES TO PAUSE
                    layer.playback.status = 'paused';
                    layer.playback.anchorMediaTime = duration;
                    layer.playback.anchorServerTime = 0;

                    const syncPayload: GSMessage = {
                        type: 'video_sync',
                        numericId: id,
                        playback: layer.playback
                    };
                    broadcastJSON(syncPayload, wallClients);
                    broadcastJSON(syncPayload, editorClients);
                }
            }
        }
    }
}, 500);

// --- VITE HMR DEFENSE STRATEGY ---
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        if (process.__VSYNC_INTERVAL__) {
            clearInterval(process.__VSYNC_INTERVAL__);
        }
    });
}
