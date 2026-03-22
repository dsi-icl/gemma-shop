'use client';

import { throttle } from '@tanstack/pacer';

import { type ConnectionStatus, ReconnectingWebSocket } from './reconnectingWs';
import { GSMessageSchema, type GSMessage, type Layer } from './types';

const getGemmaBusUrl = (): string => {
    if (typeof window === 'undefined') return 'ws://localhost:3670/bus';
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}/bus`;
};

type SaveResponseCallback = (data: Extract<GSMessage, { type: 'stage_save_response' }>) => void;
type ServerMessageCallback = (data: GSMessage) => void;
type BinaryMessageCallback = (
    id: number,
    cx: number,
    cy: number,
    width: number,
    height: number,
    scaleX: number,
    scaleY: number,
    rotation: number
) => void;
type PlaybackCallback = (
    id: number,
    playback: Extract<Layer, { type: 'video' }>['playback']
) => void;
type ConnectionStatusCallback = (status: ConnectionStatus) => void;

export class EditorEngine {
    private rws: ReconnectingWebSocket;
    private messageCallbacks = new Set<ServerMessageCallback>();
    private binaryCallbacks = new Set<BinaryMessageCallback>();
    private playbackCallbacks = new Set<PlaybackCallback>();
    private playbackStates = new Map<number, Extract<Layer, { type: 'video' }>['playback']>();
    private saveCallbacks = new Set<SaveResponseCallback>();
    private connectionStatusCallbacks = new Set<ConnectionStatusCallback>();
    private bufferedHydration: Extract<GSMessage, { type: 'hydrate' }> | null = null;
    private hydrateResolver: ((data: Extract<GSMessage, { type: 'hydrate' }>) => void) | null =
        null;
    private clockOffset = 0;
    private bestRTT = Infinity;
    private pingTimer: ReturnType<typeof setTimeout> | null = null;
    private currentProjectId: string | null = null;
    private currentCommitId: string | null = null;
    private currentSlideId: string | null = null;

    private constructor() {
        this.rws = new ReconnectingWebSocket(getGemmaBusUrl(), {
            binaryType: 'arraybuffer',
            onOpen: () => {
                console.log('Editor Engine: Connected to Server');
                // Reset clock sync state on every (re)connect
                this.clockOffset = 0;
                this.bestRTT = Infinity;
                if (this.pingTimer) clearTimeout(this.pingTimer);
                this.startClockSync();

                // Re-join the scope if we were already in one (reconnection case)
                if (this.currentProjectId && this.currentCommitId && this.currentSlideId) {
                    this.joinScope(
                        this.currentProjectId,
                        this.currentCommitId,
                        this.currentSlideId
                    );
                }
            },
            onMessage: (event) => this.handleMessage(event)
        });

        this.rws.onStateChange((status) => {
            this.connectionStatusCallbacks.forEach((cb) => cb(status));
        });
    }

    /** Access the underlying WebSocket (changes on each reconnect) */
    public get ws(): WebSocket {
        return this.rws.ws;
    }

    private handleMessage(event: MessageEvent) {
        // --- BINARY FAST-PATH PARSER ---
        if (event.data instanceof ArrayBuffer) {
            const view = new DataView(event.data);
            const opcode = view.getUint8(0);

            if (opcode === 0x09) {
                const t0 = view.getFloat64(1, true);
                const t1 = view.getFloat64(9, true);
                const t2 = view.getFloat64(17, true);
                this.handlePong({ t0, t1, t2 });
                return;
            }

            if (opcode === 0x05) {
                const count = view.getUint16(1, true);
                let offset = 3;
                for (let i = 0; i < count; i++) {
                    const id = view.getUint16(offset, true);
                    const cx = view.getFloat32(offset + 2, true);
                    const cy = view.getFloat32(offset + 6, true);
                    const width = view.getFloat32(offset + 10, true);
                    const height = view.getFloat32(offset + 14, true);
                    const scaleX = view.getFloat32(offset + 18, true);
                    const scaleY = view.getFloat32(offset + 22, true);
                    const rotation = view.getFloat32(offset + 26, true);

                    this.binaryCallbacks.forEach((cb) =>
                        cb(id, cx, cy, width, height, scaleX, scaleY, rotation)
                    );
                    offset += 30;
                }
            }
            return;
        }

        // --- JSON SLOW-PATH ---
        if (typeof event.data === 'string') {
            let data: GSMessage;
            try {
                data = GSMessageSchema.parse(JSON.parse(event.data));
            } catch (err) {
                console.warn('[EditorEngine] Failed to parse message:', err, event.data);
                return;
            }

            if (data.type === 'video_sync' || data.type === 'video_seek') {
                const nextPlayback = data.playback ??
                    this.playbackStates.get(data.numericId) ?? {
                        status: 'paused',
                        anchorMediaTime: data.type === 'video_seek' ? data.mediaTime : 0,
                        anchorServerTime: 0
                    };
                this.playbackStates.set(data.numericId, nextPlayback);
                this.playbackCallbacks.forEach((cb) => cb(data.numericId, nextPlayback));
                return;
            }

            if (data.type === 'stage_save_response') {
                this.saveCallbacks.forEach((cb) => cb(data));
                return;
            }

            if (data.type === 'hydrate') {
                this.bufferedHydration = data;
                data.layers.forEach((l) => {
                    if (l.type === 'video' && l.playback && !this.playbackStates.has(l.numericId))
                        this.playbackStates.set(l.numericId, l.playback);
                });
                if (this.hydrateResolver) {
                    this.hydrateResolver(data);
                    this.hydrateResolver = null;
                }
            }

            this.messageCallbacks.forEach((cb) => cb(data));
        }
    }

    public static getInstance(): EditorEngine {
        if (typeof window === 'undefined') {
            throw new Error('EditorEngine can only be used in the browser');
        }
        if (!window.__EDITOR_ENGINE__) {
            window.__EDITOR_ENGINE__ = new EditorEngine();
        }
        return window.__EDITOR_ENGINE__;
    }

    public destroy() {
        console.log('Editor Engine: Assassinating ghost instance...');
        if (this.pingTimer) clearTimeout(this.pingTimer);
        this.rws.destroy();
        this.messageCallbacks.clear();
        this.binaryCallbacks.clear();
        this.playbackCallbacks.clear();
        this.connectionStatusCallbacks.clear();
    }

    /**
     * Returns a promise that resolves with the next hydrate message.
     * If a hydrate was already buffered (from joinScope), resolves immediately.
     * Call clearBufferedHydration() before joinScope to ensure a fresh wait.
     */
    public waitForHydrate(): Promise<Extract<GSMessage, { type: 'hydrate' }>> {
        if (this.bufferedHydration) {
            const data = this.bufferedHydration;
            this.bufferedHydration = null;
            return Promise.resolve(data);
        }
        return new Promise((resolve) => {
            this.hydrateResolver = resolve;
        });
    }

    /** Clear any buffered hydration so the next waitForHydrate waits for a fresh message. */
    public clearBufferedHydration() {
        this.bufferedHydration = null;
        this.hydrateResolver = null;
    }

    public getServerTime(): number {
        return Date.now() + this.clockOffset;
    }

    private startClockSync() {
        const sendPing = () => {
            const buffer = new ArrayBuffer(9);
            const view = new DataView(buffer);
            view.setUint8(0, 0x08);
            view.setFloat64(1, Date.now(), true);
            this.rws.send(buffer);
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

    /** Wall currently bound to this editor session (if any) */
    public boundWallId: string | null = null;

    /** Join a project/commit/slide scope. Re-sends hello if already connected. */
    public joinScope(projectId: string, commitId: string, slideId: string) {
        this.currentProjectId = projectId;
        this.currentCommitId = commitId;
        this.currentSlideId = slideId;
        // Playback cache is scope-local; avoid cross-scope numericId collisions.
        this.playbackStates.clear();

        this.sendJSON({
            type: 'hello',
            specimen: 'editor',
            projectId,
            commitId,
            slideId
        });

        // Auto-rebind the wall to the new slide when navigating
        if (this.boundWallId) {
            this.sendJSON({
                type: 'bind_wall',
                wallId: this.boundWallId,
                projectId,
                commitId,
                slideId
            });
        }
    }

    /** Bind a wall to follow this editor's current scope */
    public bindWall(wallId: string, projectId: string, commitId: string, slideId: string) {
        this.boundWallId = wallId;
        this.sendJSON({
            type: 'bind_wall',
            wallId,
            projectId,
            commitId,
            slideId
        });
    }

    /** Unbind the currently bound wall */
    public unbindWall() {
        if (this.boundWallId) {
            this.sendJSON({
                type: 'unbind_wall',
                wallId: this.boundWallId
            });
            this.boundWallId = null;
        }
    }

    /** Request the bus to save the current scope state */
    public requestSave(message: string, isAutoSave = false) {
        this.sendJSON({ type: 'stage_save', message, isAutoSave });
    }

    /** Notify the bus that the scope is dirty */
    public sendDirty() {
        this.sendJSON({ type: 'stage_dirty' });
    }

    public subscribeToSaveResponse(cb: SaveResponseCallback) {
        this.saveCallbacks.add(cb);
        return () => {
            this.saveCallbacks.delete(cb);
        };
    }

    /** Subscribe to connection status changes (connecting, connected, reconnecting, disconnected) */
    public onConnectionStatusChange(cb: ConnectionStatusCallback) {
        this.connectionStatusCallbacks.add(cb);
        return () => {
            this.connectionStatusCallbacks.delete(cb);
        };
    }

    /** Current connection status */
    public get connectionStatus(): ConnectionStatus {
        return this.rws.status;
    }

    public sendJSON = (data: GSMessage) => {
        // Protocol discipline:
        // Editor upsert_layer for video should never carry playback timeline fields.
        if (data.type === 'upsert_layer' && data.layer.type === 'video') {
            const { playback: _playback, ...layerWithoutPlayback } = data.layer;
            this.rws.send(JSON.stringify({ ...data, layer: layerWithoutPlayback }));
            return;
        }
        this.rws.send(JSON.stringify(data));
    };

    public broadcastBinaryMove = throttle(
        (
            numericId: number,
            x: number,
            y: number,
            width: number,
            height: number,
            scaleX: number,
            scaleY: number,
            rotation: number
        ) => {
            const buffer = new ArrayBuffer(33);
            const view = new DataView(buffer);
            view.setUint8(0, 0x05);
            view.setUint16(1, 1, true);
            view.setUint16(3, numericId, true);
            view.setFloat32(5, x, true);
            view.setFloat32(9, y, true);
            view.setFloat32(13, width, true);
            view.setFloat32(17, height, true);
            view.setFloat32(21, scaleX, true);
            view.setFloat32(25, scaleY, true);
            view.setFloat32(29, rotation, true);
            this.rws.send(buffer);
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
