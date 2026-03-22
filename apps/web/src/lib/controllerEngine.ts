'use client';

import { ReconnectingWebSocket } from './reconnectingWs';
import { GSMessageSchema, type GSMessage } from './types';

const getGemmaBusUrl = (): string => {
    if (typeof window === 'undefined') return 'ws://localhost:3670/bus';
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}/bus`;
};

type BindingStatus = {
    bound: boolean;
    projectId?: string;
    commitId?: string;
    slideId?: string;
};

type BindingCallback = (status: BindingStatus) => void;
type HydrateCallback = (layers: Extract<GSMessage, { type: 'hydrate' }>['layers']) => void;
type SlidesUpdatedCallback = (
    slides: Array<{
        id: string;
        order: number;
        name: string;
    }>
) => void;
type ServerMessageCallback = (data: GSMessage) => void;

export class ControllerEngine {
    private rws: ReconnectingWebSocket;
    public wallId: string;
    private bindingCallbacks = new Set<BindingCallback>();
    private hydrateCallbacks = new Set<HydrateCallback>();
    private slidesUpdatedCallbacks = new Set<SlidesUpdatedCallback>();
    private messageCallbacks = new Set<ServerMessageCallback>();
    private lastBindSignature: string | null = null;

    private constructor(wallId: string) {
        this.wallId = wallId;
        this.rws = new ReconnectingWebSocket(getGemmaBusUrl(), {
            binaryType: 'arraybuffer',
            onOpen: () => {
                console.log('Controller Engine: Connected to Server');
                this.lastBindSignature = null;
                this.sendJSON({
                    type: 'hello',
                    specimen: 'controller',
                    wallId: this.wallId
                });
            },
            onMessage: (event) => {
                if (typeof event.data !== 'string') return;
                const data = GSMessageSchema.parse(JSON.parse(event.data));
                this.messageCallbacks.forEach((cb) => cb(data));

                if (data.type === 'wall_binding_status') {
                    this.bindingCallbacks.forEach((cb) =>
                        cb({
                            bound: data.bound,
                            projectId: data.projectId,
                            commitId: data.commitId,
                            slideId: data.slideId
                        })
                    );
                }

                if (data.type === 'hydrate') {
                    this.hydrateCallbacks.forEach((cb) => cb(data.layers));
                }

                if (data.type === 'slides_updated') {
                    this.slidesUpdatedCallbacks.forEach((cb) => cb(data.slides));
                }
            }
        });

        // On disconnect: notify UI that binding state is unknown
        this.rws.onStateChange((status) => {
            if (status === 'reconnecting' || status === 'disconnected') {
                this.bindingCallbacks.forEach((cb) => cb({ bound: false }));
            }
        });
    }

    public static getInstance(wallId: string): ControllerEngine {
        if (typeof window === 'undefined') {
            throw new Error('ControllerEngine can only be used in the browser');
        }
        if (!window.__CONTROLLER_ENGINE__ || window.__CONTROLLER_ENGINE__.wallId !== wallId) {
            window.__CONTROLLER_ENGINE__?.destroy();
            window.__CONTROLLER_ENGINE__ = new ControllerEngine(wallId);
        }
        return window.__CONTROLLER_ENGINE__;
    }

    public destroy() {
        console.log('Controller Engine: Assassinating ghost instance...');
        this.rws.destroy();
        this.bindingCallbacks.clear();
        this.hydrateCallbacks.clear();
        this.slidesUpdatedCallbacks.clear();
        this.messageCallbacks.clear();
    }

    public sendJSON = (data: GSMessage) => {
        this.rws.send(JSON.stringify(data));
    };

    /** Navigate the bound wall to a different slide */
    public bindSlide(projectId: string, commitId: string, slideId: string) {
        const signature = `${projectId}:${commitId}:${slideId}`;
        if (this.lastBindSignature === signature) return;
        this.lastBindSignature = signature;
        this.sendJSON({
            type: 'bind_wall',
            wallId: this.wallId,
            projectId,
            commitId,
            slideId
        });
    }

    public onBindingStatus(cb: BindingCallback) {
        this.bindingCallbacks.add(cb);
        return () => {
            this.bindingCallbacks.delete(cb);
        };
    }

    public onHydrate(cb: HydrateCallback) {
        this.hydrateCallbacks.add(cb);
        return () => {
            this.hydrateCallbacks.delete(cb);
        };
    }

    public onSlidesUpdated(cb: SlidesUpdatedCallback) {
        this.slidesUpdatedCallbacks.add(cb);
        return () => {
            this.slidesUpdatedCallbacks.delete(cb);
        };
    }

    public onMessage(cb: ServerMessageCallback) {
        this.messageCallbacks.add(cb);
        return () => {
            this.messageCallbacks.delete(cb);
        };
    }
}

// --- VITE HMR DEFENSE STRATEGY ---
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        if (window.__CONTROLLER_ENGINE__) {
            window.__CONTROLLER_ENGINE__.destroy();
            window.__CONTROLLER_ENGINE__ = undefined;
        }
    });
}
