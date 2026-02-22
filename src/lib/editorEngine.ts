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
export class EditorEngine {
    private static instance: EditorEngine;
    public ws: WebSocket;
    private messageCallbacks = new Set<ServerMessageCallback>();
    private binaryCallbacks = new Set<BinaryMessageCallback>();
    private cachedHydration: any = null;
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
                    // Batched Move Opcode
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

            // --- JSON SLOW-PATH (like Hydration state) ---
            if (typeof event.data === 'string') {
                const data = JSON.parse(event.data);

                // Intercept Pong to calculate time difference
                if (data.type === 'pong') {
                    this.handlePong(data);
                    return;
                }
                // Intercept and cache the hydration payload
                if (data.type === 'hydrate') {
                    this.cachedHydration = data;
                }
                this.messageCallbacks.forEach((cb) => cb(data));
            }
        };
    }

    // Global Accessor
    public static getInstance(): EditorEngine {
        if (!EditorEngine.instance) EditorEngine.instance = new EditorEngine();
        return EditorEngine.instance;
    }

    // --- NEW CLOCK MATH ---
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

    // --- REACT INTERFACE ---
    public subscribe(cb: ServerMessageCallback) {
        this.messageCallbacks.add(cb);

        // If React mounts AFTER the server already sent the state, feed it immediately
        if (this.cachedHydration) {
            cb(this.cachedHydration);
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

    public sendJSON = throttle(
        (data: any) => {
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify(data));
            } else {
                console.warn('WebSocket not open. Cannot send JSON:', data);
            }
        },
        { wait: 100 }
    );

    // --- THE BINARY PACKER ---
    // Abstracts the memory management away from React components
    public broadcastBinaryMove = throttle(
        (numericId: number, x: number, y: number, scale: number, rotation: number) => {
            if (this.ws.readyState !== WebSocket.OPEN) return;

            // Pack 1 object (1 byte opcode + 2 byte count + 18 byte payload)
            const buffer = new ArrayBuffer(21);
            const view = new DataView(buffer);

            view.setUint8(0, 0x05); // Opcode 5: Batched Move
            view.setUint16(1, 1, true); // Count = 1

            view.setUint16(3, numericId, true); // Layer ID
            view.setFloat32(5, x, true); // X
            view.setFloat32(9, y, true); // Y
            view.setFloat32(13, scale, true); // Scale
            view.setFloat32(17, rotation, true); // Rotation

            this.ws.send(buffer);
        },
        { wait: 100 }
    );
}
