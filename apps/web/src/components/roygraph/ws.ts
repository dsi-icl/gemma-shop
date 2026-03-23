import { getWebSocketUrl } from '../../lib/runtimeUrl';

let socket: WebSocket | null = null;

const getRoyBusUrl = (): string => {
    return getWebSocketUrl('/roy');
};

export function getWS(): WebSocket {
    if (socket) {
        return socket;
    }

    socket = new WebSocket(getRoyBusUrl());
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
        socket?.send(JSON.stringify({ type: 'hello', specimen: 'roy' }));
    };

    return socket;
}
