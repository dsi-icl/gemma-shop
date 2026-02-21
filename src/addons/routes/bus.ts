import type { Peer } from 'crossws';
import { defineWebSocketHandler } from 'nitro/h3';

const wallClients = new Set<Peer>();
const editorClients = new Set<Peer>();

// The Master State
const stageState = { layers: new Map<number, any>() };

export default defineWebSocketHandler({
    open(peer) {
        peer.websocket.binaryType = 'arraybuffer';
        // peer.send({ id: peer.id, message: 'server hello' });
        // peer.publish('channel', { id: peer.id, status: 'joined' });
        // peer.subscribe('channel');
    },
    message(peer, message) {
        // 1. JSON COMMANDS & CLOCK SYNC
        if (message.rawData instanceof Buffer && message.rawData[0] === '{'.charCodeAt(0)) {
            const data = message.json() as any;

            // A. Clock Sync
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

            // B. State Management
            if (data.type === 'upsert_layer') {
                stageState.layers.set(data.numericId, data);
                console.log('Sending out upsert_layer to peers', wallClients.size, wallClients);
                broadcastJSON(data, wallClients);
            }

            if (data.type === 'video_play') {
                const layer = stageState.layers.get(data.numericId);
                if (layer) {
                    layer.playback = {
                        status: 'playing',
                        anchorMediaTime: 0,
                        anchorServerTime: Date.now() + 500
                    };
                    broadcastJSON(
                        { type: 'video_sync', numericId: data.numericId, playback: layer.playback },
                        wallClients
                    );
                }
            }
        }
    },
    close(peer) {
        // peer.publish('channel', { id: peer.id, status: 'left' });
    }
});

function broadcastJSON(data: any, peers: Set<Peer>) {
    const payload = JSON.stringify(data);
    for (const peer of peers) peer.send(payload);
}
