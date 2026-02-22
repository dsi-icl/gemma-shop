'use client';

import { throttle } from '@tanstack/pacer';

const SERVER_URL = `ws://${window.location.hostname}:3000/bus`;

type ServerMessageCallback = (data: any) => void;
type BinaryMessageCallback = (
    id: number,
    cx: number,
    cy: number,
    scale: number,
    rotation: number
) => void;
type PlaybackCallback = (id: number, playback: any) => void;

export class EditorEngine {
    private static instance: EditorEngine;
    public ws: WebSocket;
    private messageCallbacks = new Set<ServerMessageCallback>();
    private binaryCallbacks = new Set<BinaryMessageCallback>();
    private playbackCallbacks = new Set<PlaybackCallback>();
    private playbackStates = new Map<number, any>();
    private bufferedHydration: any = null;
    private clockOffset = 0;
    private bestRTT = Infinity;

    private constructor() {
        this.ws = new WebSocket(SERVER_URL);
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
                if (view.getUint8(0) === 0x05) {
                    const count = view.getUint16(1, true);
                    let offset = 3;
                    for (let i = 0; i < count; i++) {
                        const id = view.getUint16(offset, true);
                        const cx = view.getFloat32(offset + 2, true);
                        const cy = view.getFloat32(offset + 6, true);
                        const scale = view.getFloat32(offset + 10, true);
                        const rotation = view.getFloat32(offset + 14, true);

                        this.binaryCallbacks.forEach((cb) => cb(id, cx, cy, scale, rotation));
                        offset += 18;
                    }
                }
                return;
            }

            // --- JSON SLOW-PATH ---
            if (typeof event.data === 'string') {
                const data = JSON.parse(event.data);

                if (data.type === 'pong') {
                    this.handlePong(data);
                    return;
                }

                // Intercept Playback. Save it, broadcast it, and STOP it from reaching React.
                if (data.type === 'video_sync' || data.type === 'video_seek') {
                    this.playbackStates.set(data.numericId, data.playback);
                    this.playbackCallbacks.forEach((cb) => cb(data.numericId, data.playback));
                    return;
                }

                if (data.type === 'hydrate') {
                    this.bufferedHydration = data;
                    // Populate the playback memory on refresh so components have accurate data!
                    data.layers.forEach((l: any) => {
                        if (l.playback) this.playbackStates.set(l.numericId, l.playback);
                    });
                }

                console.log('Preparing', data);
                this.messageCallbacks.forEach((cb) => cb(data));
            }
        };
    }

    public static getInstance(): EditorEngine {
        if (!EditorEngine.instance) EditorEngine.instance = new EditorEngine();
        return EditorEngine.instance;
    }

    public getServerTime(): number {
        return Date.now() + this.clockOffset;
    }

    private startClockSync() {
        const sendPing = () => {
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping', t0: Date.now() }));
            }
            setTimeout(sendPing, 2000);
        };
        sendPing();
    }

    private handlePong(data: any) {
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

    public setPlayback(id: number, pb: any) {
        this.playbackStates.set(id, pb);
    }

    public sendJSON = (data: any) => {
        if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data));
        else console.warn('WebSocket not open. Cannot send JSON:', data);
    };

    public broadcastBinaryMove = throttle(
        (numericId: number, x: number, y: number, scale: number, rotation: number) => {
            if (this.ws.readyState !== WebSocket.OPEN) return;
            const buffer = new ArrayBuffer(21);
            const view = new DataView(buffer);
            view.setUint8(0, 0x05);
            view.setUint16(1, 1, true);
            view.setUint16(3, numericId, true);
            view.setFloat32(5, x, true);
            view.setFloat32(9, y, true);
            view.setFloat32(13, scale, true);
            view.setFloat32(17, rotation, true);
            this.ws.send(buffer);
        },
        { wait: 200 }
    );
}
