import type { Peer } from 'crossws';
import { defineWebSocketHandler } from 'nitro/h3';

const sockets: Map<string, WebSocket> = new Map();

export default defineWebSocketHandler({
    open(peer) {
        const connect = (peer: Peer) => {
            if (!peer?.websocket?.OPEN) return;
            if (sockets.has(peer.id)) return;
            console.log(`Connecting proxy to ${peer.id}`);
            const proxiedSocket = new WebSocket('http://127.0.0.1:3375/ws');
            proxiedSocket.onmessage = (event) => peer.send(event.data);
            proxiedSocket.onclose = () => {
                console.log(`Proxy to ${peer.id} closed :(`);
                sockets.delete(peer.id);
                setTimeout(() => connect(peer), 1000);
            };
            proxiedSocket.onerror = () => {
                console.log(`Proxy to ${peer.id} broken :(`);
                sockets.delete(peer.id);
                setTimeout(() => connect(peer), 1000);
            };
            peer.websocket.onmessage = (event) => proxiedSocket.send(event.data);
            sockets.set(peer.id, proxiedSocket);
        };
        connect(peer);
    },

    close(peer) {
        sockets.get(peer.id)?.close();
        sockets.delete(peer.id);
    }
});

// --- VITE HMR DEFENSE STRATEGY ---
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        sockets.forEach((socket) => socket.close());
        sockets.clear();
    });
}
