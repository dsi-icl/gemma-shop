'use client';

import { GSMessageSchema, type GSMessage } from './types';

const WEBSOCKET_GEMMA_BUS = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/bus`;

type BindingStatus = {
    bound: boolean;
    projectId?: string;
    slideId?: string;
};

type BindingCallback = (status: BindingStatus) => void;
type HydrateCallback = (layers: Extract<GSMessage, { type: 'hydrate' }>['layers']) => void;

export class ControllerEngine {
    public ws: WebSocket;
    public wallId: string;
    private bindingCallbacks = new Set<BindingCallback>();
    private hydrateCallbacks = new Set<HydrateCallback>();

    private constructor(wallId: string) {
        this.wallId = wallId;
        this.ws = new WebSocket(WEBSOCKET_GEMMA_BUS);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            console.log('Controller Engine: Connected to Server');
            this.sendJSON({
                type: 'hello',
                specimen: 'controller',
                wallId: this.wallId
            });
        };

        this.ws.onmessage = (event) => {
            if (typeof event.data !== 'string') return;
            const data = GSMessageSchema.parse(JSON.parse(event.data));

            if (data.type === 'wall_binding_status') {
                this.bindingCallbacks.forEach((cb) =>
                    cb({
                        bound: data.bound,
                        projectId: data.projectId,
                        slideId: data.slideId
                    })
                );
            }

            if (data.type === 'hydrate') {
                this.hydrateCallbacks.forEach((cb) => cb(data.layers));
            }
        };
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
        this.ws.close();
        this.bindingCallbacks.clear();
        this.hydrateCallbacks.clear();
    }

    public sendJSON = (data: GSMessage) => {
        if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data));
        else console.warn('WebSocket not open. Cannot send JSON:', data);
    };

    /** Navigate the bound wall to a different slide */
    public bindSlide(projectId: string, slideId: string) {
        this.sendJSON({
            type: 'bind_wall',
            wallId: this.wallId,
            projectId,
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
