'use client';

import { throttle } from '@tanstack/pacer';

import { GSMessageSchema, type GSMessage, type Layer } from './types';

const WEBSOCKET_GEMMA_BUS = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/bus`;

type ServerMessageCallback = (data: GSMessage) => void;
type BinaryMessageCallback = (
    id: number,
    cx: number,
    cy: number,
    scaleX: number,
    scaleY: number,
    rotation: number
) => void;
type PlaybackCallback = (
    id: number,
    playback: Extract<Layer, { type: 'video' }>['playback']
) => void;

export class EditorEngine {
    public ws: WebSocket;
    private pingTimer: ReturnType<typeof setTimeout> | null = null;
    private messageCallbacks = new Set<ServerMessageCallback>();
    private binaryCallbacks = new Set<BinaryMessageCallback>();
    private playbackCallbacks = new Set<PlaybackCallback>();
    private playbackStates = new Map<number, Extract<Layer, { type: 'video' }>['playback']>();
    private bufferedHydration: Extract<GSMessage, { type: 'hydrate' }> | null = null;
    private clockOffset = 0;
    private bestRTT = Infinity;

    private constructor() {
        this.ws = new WebSocket(WEBSOCKET_GEMMA_BUS);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            console.log('Editor Engine: Connected to Server');
            this.ws.send(JSON.stringify({ type: 'hello', specimen: 'editor' }));
            this.startClockSync();
        };

        this.ws.onmessage = (event) => {
            // --- BINARY FAST-PATH PARSER ---
            if (event.data instanceof ArrayBuffer) {
                const view = new DataView(event.data);
                const opcode = view.getUint8(0);

                // NEW: Intercept Binary Pong
                if (opcode === 0x09) {
                    const t0 = view.getFloat64(1, true);
                    const t1 = view.getFloat64(9, true);
                    const t2 = view.getFloat64(17, true);
                    this.handlePong({ t0, t1, t2 });
                    return;
                }

                // Existing Batched Move logic
                if (opcode === 0x05) {
                    const count = view.getUint16(1, true);
                    let offset = 3;
                    for (let i = 0; i < count; i++) {
                        const id = view.getUint16(offset, true);
                        const cx = view.getFloat32(offset + 2, true);
                        const cy = view.getFloat32(offset + 6, true);
                        const scaleX = view.getFloat32(offset + 10, true);
                        const scaleY = view.getFloat32(offset + 14, true);
                        const rotation = view.getFloat32(offset + 18, true);

                        this.binaryCallbacks.forEach((cb) =>
                            cb(id, cx, cy, scaleX, scaleY, rotation)
                        );
                        offset += 18;
                    }
                }
                return;
            }

            // --- JSON SLOW-PATH ---
            if (typeof event.data === 'string') {
                const data = GSMessageSchema.parse(JSON.parse(event.data));

                // Intercept Playback. Save it, broadcast it, and STOP it from reaching React.
                if (data.type === 'video_sync' || data.type === 'video_seek') {
                    this.playbackStates.set(data.numericId, data.playback);
                    this.playbackCallbacks.forEach((cb) => cb(data.numericId, data.playback));
                    return;
                }

                if (data.type === 'hydrate') {
                    this.bufferedHydration = data;
                    // Populate the playback memory on refresh so components have accurate data!
                    data.layers.forEach((l) => {
                        if (l.type === 'video' && l.playback)
                            this.playbackStates.set(l.numericId, l.playback);
                    });
                }

                this.messageCallbacks.forEach((cb) => cb(data));
            }
        };
    }

    public static getInstance(): EditorEngine {
        // Escape Vite's module scope by anchoring the Singleton to the Window
        if (!window.__EDITOR_ENGINE__) {
            window.__EDITOR_ENGINE__ = new EditorEngine();
        }
        return window.__EDITOR_ENGINE__;
    }

    public destroy() {
        console.log('Editor Engine: Assassinating ghost instance...');
        if (this.pingTimer) clearTimeout(this.pingTimer);
        this.ws.close();
        this.messageCallbacks.clear();
        this.binaryCallbacks.clear();
        this.playbackCallbacks.clear();
    }

    public getServerTime(): number {
        return Date.now() + this.clockOffset;
    }

    private startClockSync() {
        const sendPing = () => {
            if (this.ws.readyState === WebSocket.OPEN) {
                // 1 byte Opcode + 8 bytes Float64 (t0) = 9 bytes total
                const buffer = new ArrayBuffer(9);
                const view = new DataView(buffer);
                view.setUint8(0, 0x08); // Opcode 0x08: Ping
                view.setFloat64(1, Date.now(), true); // little-endian
                this.ws.send(buffer);
            }
            this.pingTimer = setTimeout(sendPing, 3000);
        };
        sendPing();
    }

    private handlePong(data: Omit<Extract<GSMessage, { type: 'pong' }>, 'type'>) {
        const rtt = Date.now() - data.t0 - (data.t2 - data.t1);
        if (rtt < this.bestRTT) {
            this.bestRTT = rtt;
            this.clockOffset = (data.t1 - data.t0 + (data.t2 - Date.now())) / 2;
        }
    }

    public subscribeToJson(cb: ServerMessageCallback) {
        this.messageCallbacks.add(cb);
        if (this.bufferedHydration) {
            cb(this.bufferedHydration);
            this.bufferedHydration = null;
        }
        return () => {
            this.messageCallbacks.delete(cb);
        };
    }

    public subscribeToBinary(cb: BinaryMessageCallback) {
        this.binaryCallbacks.add(cb);
        return () => {
            this.binaryCallbacks.delete(cb);
        };
    }

    public subscribeToPlayback(cb: PlaybackCallback) {
        this.playbackCallbacks.add(cb);
        return () => {
            this.playbackCallbacks.delete(cb);
        };
    }

    public getPlayback(id: number) {
        return this.playbackStates.get(id);
    }

    public setPlayback(id: number, pb: Extract<Layer, { type: 'video' }>['playback']) {
        this.playbackStates.set(id, pb);
    }

    public sendJSON = (data: GSMessage) => {
        if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data));
        else console.warn('WebSocket not open. Cannot send JSON:', data);
    };

    public broadcastBinaryMove = throttle(
        (
            numericId: number,
            x: number,
            y: number,
            scaleX: number,
            scaleY: number,
            rotation: number
        ) => {
            if (this.ws.readyState !== WebSocket.OPEN) return;
            const buffer = new ArrayBuffer(25);
            const view = new DataView(buffer);
            view.setUint8(0, 0x05);
            view.setUint16(1, 1, true);
            view.setUint16(3, numericId, true);
            view.setFloat32(5, x, true);
            view.setFloat32(9, y, true);
            view.setFloat32(13, scaleX, true);
            view.setFloat32(17, scaleY, true);
            view.setFloat32(21, rotation, true);
            this.ws.send(buffer);
        },
        { wait: 16 }
    );
}

// --- VITE HMR DEFENSE STRATEGY ---
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        if (window.__EDITOR_ENGINE__) {
            window.__EDITOR_ENGINE__.destroy();
            window.__EDITOR_ENGINE__ = undefined;
        }
    });
}
