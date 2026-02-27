'use client';

let socket: WebSocket | null;
const listeners: Array<(event: MessageEvent) => void> = [];

export const getSocket = () => {
    if (typeof window === 'undefined') return null;
    if (socket) return socket;
    socket = new WebSocket('/broadcast');
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
        console.log('Connected to shap broadcast !');
    };
    socket.onmessage = (e) => {
        listeners.forEach((f) => f(e));
    };
    socket.onerror = () => {
        socket = null;
        setTimeout(getSocket, 5000);
    };
};

export const addListener = (func: (event: MessageEvent) => void) => {
    listeners.push(func);
};

export const removeListener = (func: (event: MessageEvent) => void) => {
    listeners.splice(
        listeners.findIndex((f) => f === func),
        1
    );
};
