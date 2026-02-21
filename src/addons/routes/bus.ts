import type { Peer } from 'crossws';
import { defineWebSocketHandler } from 'nitro/h3';

// Client connection pools
const wallClients = new Set<Peer>();
const editorClients = new Set<Peer>();

// The Master Stage State in memory
const stageState = { layers: new Map<number, any>() };

function broadcastJSON(data: any, clients: Set<Peer>) {
    const payload = JSON.stringify(data);
    for (const client of clients) {
        client.send(payload);
    }
}

export default defineWebSocketHandler({
    open(peer) {
        // We don't add them to a pool yet. We wait for the handshake.
        console.log(`[WS] Peer connected, awaiting 'hello' handshake...`);
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
        // Using your strict Buffer check to confidently intercept JSON
        if (message.rawData instanceof Buffer && message.rawData[0] === '{'.charCodeAt(0)) {
            try {
                // Leverage crossws native JSON parsing
                const data = message.json() as any;

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

                // B. Clock Sync
                if (data.type === 'ping') {
                    peer.send(
                        JSON.stringify({
                            type: 'pong',
                            t0: data.t0,
                            t1: Date.now(),
                            t2: Date.now()
                        })
                    );
                    return;
                }

                // C. Layer Setup
                if (data.type === 'upsert_layer') {
                    if (!data.playback) {
                        data.playback = {
                            status: 'paused',
                            anchorMediaTime: 0,
                            anchorServerTime: 0
                        };
                    }
                    stageState.layers.set(data.numericId, data);

                    broadcastJSON(data, wallClients);
                    broadcastJSON(data, editorClients);
                    return;
                }

                // D. Playback Controls (The Anchor State Machine)
                if (data.type === 'video_play') {
                    const layer = stageState.layers.get(data.numericId);
                    if (layer) {
                        layer.playback.status = 'playing';
                        // 500ms delay to neutralize network travel time before frames start rolling
                        layer.playback.anchorServerTime = Date.now() + 500;

                        const syncPayload = {
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
                    if (layer && layer.playback.status === 'playing') {
                        // Calculate exactly where the video should be at the moment of pause
                        const elapsed = (Date.now() - layer.playback.anchorServerTime) / 1000;

                        layer.playback.status = 'paused';
                        layer.playback.anchorMediaTime += elapsed;
                        layer.playback.anchorServerTime = 0;

                        const syncPayload = {
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
                    if (layer) {
                        layer.playback.status = 'paused';
                        layer.playback.anchorMediaTime = data.mediaTime;
                        layer.playback.anchorServerTime = 0;

                        // Broadcast the seek so clients jump to the frame
                        const syncPayload = {
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
        }

        // --- 2. BINARY FAST-PATH (Zero-Copy Relay) ---
        // If it bypassed the JSON block, we act as a dumb pipe directly to the wall screens.
        for (const client of wallClients) {
            client.send(message.rawData);
        }
    }
});
