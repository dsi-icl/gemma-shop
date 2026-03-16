'use client';

import { ReconnectingWebSocket } from './reconnectingWs';
import { GSMessageSchema, type GSMessage } from './types';

const WEBSOCKET_GEMMA_BUS = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/bus`;

type BindingStatus = {
    bound: boolean;
    projectId?: string;
    commitId?: string;
    slideId?: string;
};

type BindingCallback = (status: BindingStatus) => void;
type HydrateCallback = (layers: Extract<GSMessage, { type: 'hydrate' }>['layers']) => void;
type SlidesUpdatedCallback = (slides: Array<{ id: string; order: number; name: string }>) => void;

export class ControllerEngine {
    private rws: ReconnectingWebSocket;
    public wallId: string;
    private bindingCallbacks = new Set<BindingCallback>();
    private hydrateCallbacks = new Set<HydrateCallback>();
    private slidesUpdatedCallbacks = new Set<SlidesUpdatedCallback>();

    private constructor(wallId: string) {
        this.wallId = wallId;
        this.rws = new ReconnectingWebSocket(WEBSOCKET_GEMMA_BUS, {
            binaryType: 'arraybuffer',
            onOpen: () => {
                console.log('Controller Engine: Connected to Server');
                this.sendJSON({
                    type: 'hello',
                    specimen: 'controller',
                    wallId: this.wallId
                });
            },
            onMessage: (event) => {
                if (typeof event.data !== 'string') return;
                const data = GSMessageSchema.parse(JSON.parse(event.data));

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
    }

    public sendJSON = (data: GSMessage) => {
        this.rws.send(JSON.stringify(data));
    };

    /** Navigate the bound wall to a different slide */
    public bindSlide(projectId: string, commitId: string, slideId: string) {
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
