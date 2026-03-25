'use client';

import { ReconnectingWebSocket } from './reconnectingWs';
import { getWebSocketUrl } from './runtimeUrl';
import { GSMessageSchema, type GSMessage } from './types';

const getGemmaBusUrl = (): string => {
    return getWebSocketUrl('/bus');
};

type BindingStatus = {
    bound: boolean;
    projectId?: string;
    commitId?: string;
    slideId?: string;
    customRenderUrl?: string;
    boundSource?: 'live' | 'gallery';
};

type BindingCallback = (status: BindingStatus) => void;
type HydrateCallback = (layers: Extract<GSMessage, { type: 'hydrate' }>['layers']) => void;
type SlidesUpdatedCallback = (
    payload: {
        commitId: string;
        slides: Array<{
            id: string;
            order: number;
            name: string;
        }>;
    }
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
    private pendingJsonMessages: string[] = [];

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
                this.flushPendingMessages();
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
                            slideId: data.slideId,
                            customRenderUrl: data.customRenderUrl,
                            boundSource: data.boundSource
                        })
                    );
                }

                if (data.type === 'hydrate') {
                    this.hydrateCallbacks.forEach((cb) => cb(data.layers));
                }

                if (data.type === 'slides_updated') {
                    this.slidesUpdatedCallbacks.forEach((cb) =>
                        cb({ commitId: data.commitId, slides: data.slides })
                    );
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
        this.pendingJsonMessages = [];
        this.bindingCallbacks.clear();
        this.hydrateCallbacks.clear();
        this.slidesUpdatedCallbacks.clear();
        this.messageCallbacks.clear();
    }

    public sendJSON = (data: GSMessage) => {
        const payload = JSON.stringify(data);
        if (this.rws.status === 'connected') {
            this.rws.send(payload);
            return;
        }

        // Control-plane reliability: preserve intent issued before socket open
        // (e.g. first reboot click on gallery card).
        if (data.type === 'reboot') {
            const hasQueuedReboot = this.pendingJsonMessages.some((msg) => {
                try {
                    const parsed = JSON.parse(msg) as { type?: string };
                    return parsed.type === 'reboot';
                } catch {
                    return false;
                }
            });
            if (hasQueuedReboot) return;
        }

        this.pendingJsonMessages.push(payload);
        // Safety guard: keep queue bounded during long disconnects.
        if (this.pendingJsonMessages.length > 50) {
            this.pendingJsonMessages = this.pendingJsonMessages.slice(-50);
        }
    };

    private flushPendingMessages() {
        if (this.rws.status !== 'connected' || this.pendingJsonMessages.length === 0) return;
        const queued = this.pendingJsonMessages;
        this.pendingJsonMessages = [];
        for (const payload of queued) {
            this.rws.send(payload);
        }
    }

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
        if (typeof window !== 'undefined' && window.__CONTROLLER_ENGINE__) {
            window.__CONTROLLER_ENGINE__.destroy();
            window.__CONTROLLER_ENGINE__ = undefined;
        }
    });
}
