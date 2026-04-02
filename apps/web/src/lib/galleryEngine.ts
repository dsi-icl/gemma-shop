'use client';

import { getOrCreateDeviceIdentity, type DeviceIdentity } from './deviceIdentity';
import { ReconnectingWebSocket } from './reconnectingWs';
import { getWebSocketUrl } from './runtimeUrl';
import { GSMessageSchema, type GSMessage } from './types';

const getGemmaBusUrl = (): string => {
    return getWebSocketUrl('/bus');
};

type GalleryState = Extract<GSMessage, { type: 'gallery_state' }>;
type WallBindingChanged = Extract<GSMessage, { type: 'wall_binding_changed' }>;
type WallUnbound = Extract<GSMessage, { type: 'wall_unbound' }>;
type ProjectPublishChanged = Extract<GSMessage, { type: 'project_publish_changed' }>;
type BindOverrideRequested = Extract<GSMessage, { type: 'bind_override_requested' }>;
type BindOverrideResult = Extract<GSMessage, { type: 'bind_override_result' }>;
type ServerMessageCallback = (data: GSMessage) => void;

type WallBindingChangedCallback = (data: WallBindingChanged) => void;
type WallUnboundCallback = (data: WallUnbound) => void;
type ProjectPublishChangedCallback = (data: ProjectPublishChanged) => void;
type BindOverrideRequestedCallback = (data: BindOverrideRequested) => void;
type BindOverrideResultCallback = (data: BindOverrideResult) => void;
type GalleryStateCallback = (state: GalleryState) => void;

export class GalleryEngine {
    private rws: ReconnectingWebSocket;
    public wallId: string | null;
    public devicePublicKey: string | null = null;
    private deviceIdentityPromise: Promise<DeviceIdentity>;
    private messageCallbacks = new Set<ServerMessageCallback>();
    private wallBindingChangedCallbacks = new Set<WallBindingChangedCallback>();
    private wallUnboundCallbacks = new Set<WallUnboundCallback>();
    private projectPublishChangedCallbacks = new Set<ProjectPublishChangedCallback>();
    private bindOverrideRequestedCallbacks = new Set<BindOverrideRequestedCallback>();
    private bindOverrideResultCallbacks = new Set<BindOverrideResultCallback>();
    private galleryStateCallbacks = new Set<GalleryStateCallback>();
    private pendingJsonMessages: string[] = [];

    private constructor(wallId: string | null) {
        this.wallId = wallId;
        this.deviceIdentityPromise = getOrCreateDeviceIdentity('gallery').then((identity) => {
            this.devicePublicKey = identity.publicKey;
            return identity;
        });
        this.rws = new ReconnectingWebSocket(getGemmaBusUrl(), {
            binaryType: 'arraybuffer',
            onOpen: async () => {
                console.log('Gallery Engine: Connected to Server');
                let devicePublicKey: string | undefined;
                try {
                    const identity = await this.deviceIdentityPromise;
                    devicePublicKey = identity.publicKey;
                } catch (error) {
                    console.warn(
                        'Gallery Engine: device identity unavailable, continuing without device key',
                        error
                    );
                }
                this.sendJSON({
                    type: 'hello',
                    specimen: 'gallery',
                    ...(this.wallId ? { wallId: this.wallId } : {}),
                    ...(devicePublicKey ? { devicePublicKey } : {})
                });
                this.flushPendingMessages();
            },
            onMessage: (event) => {
                if (typeof event.data !== 'string') return;
                const data = GSMessageSchema.parse(JSON.parse(event.data));
                this.messageCallbacks.forEach((cb) => cb(data));

                if (data.type === 'gallery_state') {
                    this.galleryStateCallbacks.forEach((cb) => cb(data));
                    return;
                }

                if (data.type === 'wall_binding_changed') {
                    this.wallBindingChangedCallbacks.forEach((cb) => cb(data));
                    return;
                }

                if (data.type === 'wall_unbound') {
                    this.wallUnboundCallbacks.forEach((cb) => cb(data));
                    return;
                }

                if (data.type === 'project_publish_changed') {
                    this.projectPublishChangedCallbacks.forEach((cb) => cb(data));
                    return;
                }

                if (data.type === 'bind_override_requested') {
                    this.bindOverrideRequestedCallbacks.forEach((cb) => cb(data));
                    return;
                }

                if (data.type === 'bind_override_result') {
                    this.bindOverrideResultCallbacks.forEach((cb) => cb(data));
                }
            }
        });
    }

    public static getInstance(wallId: string | null = null): GalleryEngine {
        if (typeof window === 'undefined') {
            throw new Error('GalleryEngine can only be used in the browser');
        }
        if (!window.__GALLERY_ENGINE__ || window.__GALLERY_ENGINE__.wallId !== wallId) {
            window.__GALLERY_ENGINE__?.destroy();
            window.__GALLERY_ENGINE__ = new GalleryEngine(wallId);
        }
        return window.__GALLERY_ENGINE__;
    }

    public destroy() {
        console.log('Gallery Engine: Assassinating ghost instance...');
        this.rws.destroy();
        this.pendingJsonMessages = [];
        this.messageCallbacks.clear();
        this.wallBindingChangedCallbacks.clear();
        this.wallUnboundCallbacks.clear();
        this.projectPublishChangedCallbacks.clear();
        this.bindOverrideRequestedCallbacks.clear();
        this.bindOverrideResultCallbacks.clear();
        this.galleryStateCallbacks.clear();
    }

    public sendJSON = (data: GSMessage) => {
        const payload = JSON.stringify(data);
        if (this.rws.status === 'connected') {
            this.rws.send(payload);
            return;
        }
        this.pendingJsonMessages.push(payload);
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

    public decideBindOverride(requestId: string, wallId: string, allow: boolean) {
        this.sendJSON({
            type: 'bind_override_decision',
            requestId,
            wallId,
            allow
        });
    }

    public unbindWall(wallId: string) {
        this.sendJSON({
            type: 'unbind_wall',
            wallId
        });
    }

    public onGalleryState(cb: GalleryStateCallback) {
        this.galleryStateCallbacks.add(cb);
        return () => this.galleryStateCallbacks.delete(cb);
    }

    public onWallBindingChanged(cb: WallBindingChangedCallback) {
        this.wallBindingChangedCallbacks.add(cb);
        return () => this.wallBindingChangedCallbacks.delete(cb);
    }

    public onWallUnbound(cb: WallUnboundCallback) {
        this.wallUnboundCallbacks.add(cb);
        return () => this.wallUnboundCallbacks.delete(cb);
    }

    public onProjectPublishChanged(cb: ProjectPublishChangedCallback) {
        this.projectPublishChangedCallbacks.add(cb);
        return () => this.projectPublishChangedCallbacks.delete(cb);
    }

    public onBindOverrideRequested(cb: BindOverrideRequestedCallback) {
        this.bindOverrideRequestedCallbacks.add(cb);
        return () => this.bindOverrideRequestedCallbacks.delete(cb);
    }

    public onBindOverrideResult(cb: BindOverrideResultCallback) {
        this.bindOverrideResultCallbacks.add(cb);
        return () => this.bindOverrideResultCallbacks.delete(cb);
    }

    public onMessage(cb: ServerMessageCallback) {
        this.messageCallbacks.add(cb);
        return () => this.messageCallbacks.delete(cb);
    }
}

if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        if (typeof window !== 'undefined' && window.__GALLERY_ENGINE__) {
            window.__GALLERY_ENGINE__.destroy();
            window.__GALLERY_ENGINE__ = undefined;
        }
    });
}
