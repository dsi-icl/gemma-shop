'use client';

import type { LayerState } from './types';

const WEBSOCKET_GEMMA_BUS = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/bus`;

export interface Viewport {
    x: number;
    y: number;
    w: number;
    h: number;
}

type LayoutUpdateCallback = (data: any) => void;

export class WallEngine {
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
        this.ws = new WebSocket(WEBSOCKET_GEMMA_BUS);
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
        // Escape Vite's module scope by anchoring the Singleton to the Window
        if (!(window as any).__WALL_ENGINE__) {
            if (!viewport) throw new Error('Viewport must be provided on first initialization');
            (window as any).__WALL_ENGINE__ = new WallEngine(viewport);
        }
        return (window as any).__WALL_ENGINE__;
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
                numericId: id,
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
                // 1 byte Opcode + 8 bytes Float64 (t0) = 9 bytes total
                const buffer = new ArrayBuffer(9);
                const view = new DataView(buffer);
                view.setUint8(0, 0x08); // Opcode 0x08: Ping
                view.setFloat64(1, Date.now(), true); // little-endian
                this.ws.send(buffer);
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
            } else if (
                data.type === 'hydrate' ||
                data.type === 'upsert_layer' ||
                data.type === 'delete_layer'
            ) {
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

        // CRITICAL HYDRATION FIX:
        // Wait for the video to parse its headers before attempting to seek
        if (video.readyState === 0) {
            video.addEventListener(
                'loadedmetadata',
                () => {
                    this.handlePlaybackStateChange(layer);
                },
                { once: true }
            );
            return;
        }
        if (video.readyState < 2) {
            // 2 = HAVE_CURRENT_DATA
            video.addEventListener(
                'loadeddata',
                () => {
                    this.handlePlaybackStateChange(layer);
                },
                { once: true }
            );
            return;
        }

        if (layer.playback.status === 'paused') {
            video.pause();
            video.currentTime = layer.playback.anchorMediaTime;
        } else if (layer.playback.status === 'playing') {
            const checkTime = () => {
                const now = this.getServerTime();

                if (now >= layer.playback.anchorServerTime) {
                    // PRE-SEEK: If we joined late, calculate exactly where we should be NOW
                    const expectedTime =
                        layer.playback.anchorMediaTime +
                        (now - layer.playback.anchorServerTime) / 1000;

                    if (Math.abs(video.currentTime - expectedTime) > 0.5) {
                        video.currentTime = expectedTime;
                    }

                    video.play().catch((e) => console.error('Autoplay blocked:', e));

                    // Attach Drift Controller safely
                    if ('requestVideoFrameCallback' in video) {
                        if (!layer.rvfcActive) {
                            layer.rvfcActive = true; // Lock it so it doesn't duplicate
                            video.requestVideoFrameCallback((n, m) =>
                                this.driftController(m, layer)
                            );
                        }
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

// --- VITE HMR DEFENSE STRATEGY ---
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        if ((window as any).__WALL_ENGINE__) {
            (window as any).__WALL_ENGINE__.destroy();
            (window as any).__WALL_ENGINE__ = undefined;
        }
    });
}
