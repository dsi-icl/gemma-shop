let socket: WebSocket | null = null;

const getRoyBusUrl = (): string => {
    if (typeof window === 'undefined') return 'ws://localhost:3670/roy';
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}/roy`;
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
