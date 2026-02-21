'use client';

const SERVER_URL = `ws://${window.location.hostname}:3000/bus`;
const MY_VIEWPORT = { x: 0, y: 0, w: 1920, h: 1080 };

// --- TYPES & MATH ---
type LayerUpdateCallback = (data: any) => void;

interface LayerData {
    numericId: number;
    url: string;
    config: { cx: number; cy: number; w: number; h: number; rotation: number; scale: number };
}

interface FastPathLayer {
    el: HTMLVideoElement | HTMLDivElement;
    startPos: LayerData['config'];
    targetPos: LayerData['config'];
    animStartTime: number;
    animDuration: number;
    playback: { status: string; anchorMediaTime: number; anchorServerTime: number };
}

export class WallEngine {
    // Singleton Instance
    private static instance: WallEngine;

    public ws: WebSocket;
    private clockOffset = 0;
    private bestRTT = Infinity;

    // State for the Fast-Path Render Loop
    public layers = new Map<number, any>();
    private layerUpdateCallbacks = new Set<LayerUpdateCallback>();

    private constructor() {
        this.ws = new WebSocket(SERVER_URL);
        this.ws.binaryType = 'arraybuffer';

        // 1. SOLVING THE RACE CONDITION
        // We attach listeners immediately.
        this.ws.onopen = () => {
            console.log('Engine: Connected to Server');
            this.ws.send(JSON.stringify({ type: 'hello', specimen: 'wall' }));
            this.startClockSync();
        };

        this.ws.onmessage = (event) => this.handleMessage(event);

        // If the socket was somehow already open (rare in constructor, but safe)
        if (this.ws.readyState === WebSocket.OPEN) {
            this.startClockSync();
        }
    }

    // Global Accessor
    public static getInstance(): WallEngine {
        if (!WallEngine.instance) {
            WallEngine.instance = new WallEngine();
        }
        return WallEngine.instance;
    }

    // --- CLOCK SYNC LOGIC ---
    public getServerTime(): number {
        return Date.now() + this.clockOffset;
    }

    private startClockSync() {
        const sendPing = () => {
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping', t0: Date.now() }));
            }
            setTimeout(sendPing, 2000); // Keep syncing forever
        };
        sendPing();
    }

    // --- MESSAGE ROUTING ---
    private handleMessage(event: MessageEvent) {
        // A. BINARY FAST-PATH
        if (event.data instanceof ArrayBuffer) {
            const view = new DataView(event.data);
            if (view.getUint8(0) === 0x05) {
                // Batched Move
                const count = view.getUint16(1, true);
                let offset = 3;
                for (let i = 0; i < count; i++) {
                    const id = view.getUint16(offset, true);
                    const layer = this.layers.get(id);

                    if (layer) {
                        // Update the math targets directly in the Engine state
                        layer.startPos = { ...this.calculateCurrentPosition(layer) };
                        layer.targetPos = {
                            cx: view.getFloat32(offset + 2, true),
                            cy: view.getFloat32(offset + 6, true),
                            scale: view.getFloat32(offset + 10, true),
                            rotation: view.getFloat32(offset + 14, true)
                        };
                        layer.animStartTime = this.getServerTime();
                        layer.animDuration = 100;
                    }
                    offset += 18;
                }
            }
            return;
        }

        // B. JSON SLOW-PATH
        if (typeof event.data === 'string') {
            const data = JSON.parse(event.data);

            if (data.type === 'pong') {
                this.handlePong(data);
            } else if (data.type === 'hydrate' || data.type === 'upsert_layer') {
                // Notify React to mount/unmount components
                this.layerUpdateCallbacks.forEach((cb) => cb(data));
            } else if (data.type === 'video_sync') {
                // Handle Play/Pause logic internally
                const layer = this.layers.get(data.numericId);
                if (layer) {
                    layer.playback = data.playback;
                    if (layer.playback.status === 'playing') this.schedulePlayback(layer);
                }
            }
        }
    }

    private handlePong(data: any) {
        const rtt = Date.now() - data.t0 - (data.t2 - data.t1);
        if (rtt < this.bestRTT) {
            this.bestRTT = rtt;
            this.clockOffset = (data.t1 - data.t0 + (data.t2 - Date.now())) / 2;
        }
    }

    // --- REACT INTERFACE ---
    public subscribeToLayoutUpdates(callback: LayerUpdateCallback) {
        this.layerUpdateCallbacks.add(callback);
        return () => {
            this.layerUpdateCallbacks.delete(callback);
        };
    }

    // --- MATH HELPERS ---
    public registerLayer(id: number, ref: HTMLElement) {
        console.log('registerLayer for', id);
        // React calls this when it mounts a DOM element
        // We store the reference so the Engine can animate it directly
        if (!this.layers.has(id)) {
            this.layers.set(id, {
                el: ref,
                // Default state...
                startPos: { cx: 0, cy: 0, scale: 1, rotation: 0 },
                targetPos: { cx: 0, cy: 0, scale: 1, rotation: 0 },
                playback: { status: 'paused', anchorMediaTime: 0, anchorServerTime: 0 }
            });
        } else {
            // Update ref if React re-renders (rare but possible)
            const layer = this.layers.get(id);
            if (layer) layer.el = ref;
        }
    }

    public calculateCurrentPosition(layer: any) {
        const lerp = (start: number, end: number, t: number) => start + (end - start) * t;

        let t = layer.animStartTime
            ? (this.getServerTime() - layer.animStartTime) / layer.animDuration
            : 1;
        t = Math.max(0, Math.min(1, t)); // Clamp between 0 and 1

        const cx = lerp(layer.startPos.cx, layer.targetPos.cx, t);
        const cy = lerp(layer.startPos.cy, layer.targetPos.cy, t);
        const scale = lerp(layer.startPos.scale, layer.targetPos.scale, t);
        const rot = lerp(layer.startPos.rotation, layer.targetPos.rotation, t);

        // Center-Origin DOM Math
        const w = parseFloat(layer.el.style.width || '0');
        const h = parseFloat(layer.el.style.height || '0');
        const localX = cx - w / 2 - MY_VIEWPORT.x;
        const localY = cy - h / 2 - MY_VIEWPORT.y;

        return { localX, localY, scale, rot };
    }

    public schedulePlayback(layer: FastPathLayer) {
        const videoEl = layer.el as HTMLVideoElement;

        const checkTime = () => {
            if (this.getServerTime() >= layer.playback.anchorServerTime) {
                videoEl.play();
                const driftController = (_: number, metadata: any) => {
                    if (layer.playback.status !== 'playing') return;
                    const expectedTime =
                        layer.playback.anchorMediaTime +
                        (this.getServerTime() - layer.playback.anchorServerTime) / 1000;
                    const drift = expectedTime - metadata.mediaTime;

                    if (drift > 0.5) videoEl.currentTime = expectedTime;
                    else if (drift > 0.03) videoEl.playbackRate = 1.05;
                    else if (drift < -0.03) videoEl.playbackRate = 0.95;
                    else videoEl.playbackRate = 1.0;

                    videoEl.requestVideoFrameCallback(driftController);
                };
                videoEl.requestVideoFrameCallback(driftController);
            } else {
                requestAnimationFrame(checkTime);
            }
        };
        requestAnimationFrame(checkTime);
    }
}
