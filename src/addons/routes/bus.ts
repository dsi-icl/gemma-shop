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
        peer.websocket.binaryType = 'arraybuffer';
        console.log(
            `[WS] Peer connected. Walls: ${wallClients.size} | Editors: ${editorClients.size}`
        );
    },

    close(peer) {
        wallClients.delete(peer);
        editorClients.delete(peer);
    },

    message(peer, message) {
        // --- 1. JSON SLOW-PATH (Commands & Setup) ---
        if (message.rawData instanceof Buffer && message.rawData[0] === '{'.charCodeAt(0)) {
            const data = message.json() as any;

            // -. Register clients
            if (data.type === 'hello') {
                if (data.specimen === 'wall') wallClients.add(peer);
                if (data.specimen === 'editor') editorClients.add(peer);

                // Hydrate new clients with current stage state
                peer.send(
                    JSON.stringify({
                        type: 'hydrate',
                        layers: Array.from(stageState.layers.values())
                    })
                );
            }
            // A. Clock Sync
            if (data.type === 'ping') {
                peer.send(
                    JSON.stringify({ type: 'pong', t0: data.t0, t1: Date.now(), t2: Date.now() })
                );
                return;
            }

            // B. Layer Setup
            if (data.type === 'upsert_layer') {
                // Ensure default playback state exists
                if (!data.playback) {
                    data.playback = { status: 'paused', anchorMediaTime: 0, anchorServerTime: 0 };
                }
                stageState.layers.set(data.numericId, data);

                broadcastJSON(data, wallClients);
                // Bounce back to editor pool to keep multiple editors synced
                broadcastJSON(data, editorClients);
            }

            // C. Playback Controls (The Anchor State Machine)
            if (data.type === 'video_play') {
                const layer = stageState.layers.get(data.numericId);
                if (layer) {
                    layer.playback.status = 'playing';
                    // Schedule playback slightly in the future to allow network travel
                    layer.playback.anchorServerTime = Date.now() + 500;

                    broadcastJSON(
                        { type: 'video_sync', numericId: data.numericId, playback: layer.playback },
                        wallClients
                    );
                }
            }

            if (data.type === 'video_pause') {
                const layer = stageState.layers.get(data.numericId);
                if (layer && layer.playback.status === 'playing') {
                    // Calculate exactly where the video should be at the moment of pause
                    const elapsed = (Date.now() - layer.playback.anchorServerTime) / 1000;

                    layer.playback.status = 'paused';
                    layer.playback.anchorMediaTime += elapsed;
                    layer.playback.anchorServerTime = 0;

                    broadcastJSON(
                        { type: 'video_sync', numericId: data.numericId, playback: layer.playback },
                        wallClients
                    );
                }
            }

            if (data.type === 'video_seek') {
                const layer = stageState.layers.get(data.numericId);
                if (layer) {
                    layer.playback.status = 'paused';
                    layer.playback.anchorMediaTime = data.mediaTime;
                    layer.playback.anchorServerTime = 0;

                    broadcastJSON(
                        { type: 'video_seek', numericId: data.numericId, playback: layer.playback },
                        wallClients
                    );
                }
            }

            return;
        }

        // --- 2. BINARY FAST-PATH (Zero-Copy Relay) ---
        // If it is not JSON, it is our batched binary movement payload.
        // We do not parse it. We act as a dumb pipe directly to the wall screens.
        for (const client of wallClients) {
            client.send(message.rawData);
        }
    }
});
