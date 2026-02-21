'use client';

export interface Viewport {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface LayerPlaybackState {
    status: 'playing' | 'paused';
    anchorMediaTime: number;
    anchorServerTime: number;
}

export interface LayerState {
    el: HTMLElement | HTMLVideoElement | null;
    config: { cx: number; cy: number; w: number; h: number; rotation: number; scale: number };
    startPos: { cx: number; cy: number; w: number; h: number; rotation: number; scale: number };
    targetPos: { cx: number; cy: number; w: number; h: number; rotation: number; scale: number };
    animStartTime: number;
    animDuration: number;
    playback: LayerPlaybackState;
}

type LayoutUpdateCallback = (data: any) => void;

export class WallEngine {
    private static instance: WallEngine;
    public ws: WebSocket;

    // Clock Sync State
    private clockOffset = 0;
    private bestRTT = Infinity;

    // Render State
    public layers = new Map<number, LayerState>();
    private layoutCallbacks = new Set<LayoutUpdateCallback>();
    public viewport: Viewport;

    private constructor(viewport: Viewport) {
        this.viewport = viewport;

        // Automatically detect HTTPS vs HTTP for the WebSocket protocol
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${wsProtocol}//${window.location.host}/bus`);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            console.log('Wall Engine: Connected to Master Server');
            this.ws.send(JSON.stringify({ type: 'hello', specimen: 'wall' }));
            this.startClockSync();
        };

        this.ws.onmessage = (event) => this.handleMessage(event);

        if (this.ws.readyState === WebSocket.OPEN) {
            this.startClockSync();
        }
    }

    // --- SINGLETON ACCESSOR ---
    public static getInstance(viewport?: Viewport): WallEngine {
        if (!WallEngine.instance) {
            if (!viewport) throw new Error('Viewport must be provided on first initialization');
            WallEngine.instance = new WallEngine(viewport);
        }
        return WallEngine.instance;
    }

    // --- REACT INTERFACE ---
    public subscribeToLayoutUpdates(callback: LayoutUpdateCallback) {
        this.layoutCallbacks.add(callback);
        return () => this.layoutCallbacks.delete(callback);
    }

    public registerLayer(id: number, config: any, playback: any, el: HTMLElement) {
        let layer = this.layers.get(id);
        if (!layer) {
            layer = {
                el,
                config,
                startPos: { ...config },
                targetPos: { ...config },
                animStartTime: 0,
                animDuration: 100,
                playback // Initial hydrated state
            };
            this.layers.set(id, layer);
        } else {
            layer.el = el; // Update ref if React re-rendered
            layer.playback = playback; // Ensure we have the latest state
        }

        // Evaluate the timeline and start playing/seeking immediately
        this.handlePlaybackStateChange(layer);
    }

    // --- CLOCK SYNC ---
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
        // Periodically reset bestRTT to allow for network environment changes
        setTimeout(() => {
            this.bestRTT = Infinity;
        }, 60000);
    }

    // --- MESSAGE ROUTING ---
    private handleMessage(event: MessageEvent) {
        // A. BINARY FAST-PATH (High-Frequency Movement)
        if (event.data instanceof ArrayBuffer) {
            const view = new DataView(event.data);
            if (view.getUint8(0) === 0x05) {
                // Opcode: Batched Move
                const count = view.getUint16(1, true);
                let offset = 3;
                for (let i = 0; i < count; i++) {
                    const id = view.getUint16(offset, true);
                    const layer = this.layers.get(id);

                    if (layer) {
                        // Set current visual position as the new start, incoming data as the new target
                        layer.startPos = { ...this.calculateCurrentPosition(layer) };
                        layer.targetPos = {
                            ...layer.targetPos,
                            cx: view.getFloat32(offset + 2, true),
                            cy: view.getFloat32(offset + 6, true),
                            scale: view.getFloat32(offset + 10, true),
                            rotation: view.getFloat32(offset + 14, true)
                        };
                        layer.animStartTime = this.getServerTime();
                        layer.animDuration = 100; // Matches expected editor broadcast rate
                    }
                    offset += 18;
                }
            }
            return;
        }

        // B. JSON SLOW-PATH (Low-Frequency Events)
        if (typeof event.data === 'string') {
            const data = JSON.parse(event.data);

            if (data.type === 'pong') {
                this.handlePong(data);
            } else if (data.type === 'hydrate' || data.type === 'upsert_layer') {
                // Broadcast to React to update the DOM
                this.layoutCallbacks.forEach((cb) => cb(data));
            } else if (data.type === 'video_sync' || data.type === 'video_seek') {
                const layer = this.layers.get(data.numericId);
                if (layer) {
                    layer.playback = data.playback;
                    this.handlePlaybackStateChange(layer);
                }
            }
        }
    }

    // --- PLAYBACK & SYNC LOGIC ---
    private handlePlaybackStateChange(layer: LayerState) {
        const video = layer.el as HTMLVideoElement;
        if (!video || typeof video.play !== 'function') return;

        if (layer.playback.status === 'paused') {
            video.pause();
            video.currentTime = layer.playback.anchorMediaTime;
        } else if (layer.playback.status === 'playing') {
            // Schedule playback to start precisely at anchorServerTime
            const checkTime = () => {
                if (this.getServerTime() >= layer.playback.anchorServerTime) {
                    video.play().catch((e) => console.error('Autoplay blocked:', e));

                    if ('requestVideoFrameCallback' in video) {
                        video.requestVideoFrameCallback((n, m) => this.driftController(m, layer));
                    } else {
                        console.warn(
                            'requestVideoFrameCallback not supported. Sync will be loose.'
                        );
                    }
                } else {
                    requestAnimationFrame(checkTime);
                }
            };
            requestAnimationFrame(checkTime);
        }
    }

    private driftController(metadata: any, layer: LayerState) {
        if (layer.playback.status !== 'playing' || !layer.el) return;

        const video = layer.el as HTMLVideoElement;
        const currentServerTime = this.getServerTime();

        // Master timeline formula
        const expectedTime =
            layer.playback.anchorMediaTime +
            (currentServerTime - layer.playback.anchorServerTime) / 1000;
        const drift = expectedTime - metadata.mediaTime;

        // Apply drift corrections
        if (drift > 0.5) {
            video.currentTime = expectedTime; // Hard seek if hopelessly lost
        } else if (drift > 0.03) {
            video.playbackRate = 1.05; // Subtly speed up
        } else if (drift < -0.03) {
            video.playbackRate = 0.95; // Subtly slow down
        } else {
            video.playbackRate = 1.0; // Frame locked
        }

        // Loop exactly when the next hardware frame is presented
        video.requestVideoFrameCallback((n, m) => this.driftController(m, layer));
    }

    // --- MATH & LERP ---
    private lerp(start: number, end: number, t: number): number {
        return start + (end - start) * t;
    }

    public calculateCurrentPosition(layer: LayerState) {
        if (!layer.animStartTime) return layer.targetPos;

        let t = (this.getServerTime() - layer.animStartTime) / layer.animDuration;
        t = Math.max(0, Math.min(1, t)); // Clamp t between 0 and 1

        return {
            cx: this.lerp(layer.startPos.cx, layer.targetPos.cx, t),
            cy: this.lerp(layer.startPos.cy, layer.targetPos.cy, t),
            scale: this.lerp(layer.startPos.scale, layer.targetPos.scale, t),
            rotation: this.lerp(layer.startPos.rotation, layer.targetPos.rotation, t),
            w: layer.config.w,
            h: layer.config.h
        };
    }
}
