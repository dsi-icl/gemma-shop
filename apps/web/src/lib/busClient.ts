'use client';

import { getOrCreateDeviceIdentity, type DeviceIdentity } from './deviceIdentity';
import { type ConnectionStatus, ReconnectingWebSocket } from './reconnectingWs';
import { getWebSocketUrl } from './runtimeUrl';
import type { GSMessage } from './types';

type HelloMessage = Extract<GSMessage, { type: 'hello' }>;
type HelloChallengeMessage = Extract<GSMessage, { type: 'hello_challenge' }>;
type HelloAuthMessage = Extract<GSMessage, { type: 'hello_auth' }>;

type BusClientAuth =
    | {
          kind: 'none';
      }
    | {
          kind: 'editor';
      }
    | {
          kind: 'wall';
          wallId: string;
          col: number;
          row: number;
      }
    | {
          kind: 'controller';
          wallId: string;
          portalToken?: string | null;
      }
    | {
          kind: 'gallery';
          wallId?: string;
      };

interface BusClientOptions {
    onOpen?: () => void | Promise<void>;
    onMessage?: (event: MessageEvent) => void;
    auth?: BusClientAuth;
}
type ReadyCallback = () => void;

const getGemmaBusUrl = (): string => {
    return getWebSocketUrl('/bus');
};

export class BusClient {
    private rws: ReconnectingWebSocket;
    private opts: BusClientOptions;
    private pendingDeviceIdentity: DeviceIdentity | null = null;
    private isAuthenticated = true;
    private isReady = false;
    private readyCallbacks = new Set<ReadyCallback>();

    constructor(options: BusClientOptions) {
        this.opts = options;

        this.rws = new ReconnectingWebSocket(getGemmaBusUrl(), {
            binaryType: 'arraybuffer',
            onOpen: () => {
                void this.handleOpen();
            },
            onMessage: (event) => {
                if (this.handleAuthMessage(event)) return;
                this.opts.onMessage?.(event);
            }
        });
    }

    public get ws(): WebSocket {
        return this.rws.ws;
    }

    public get status(): ConnectionStatus {
        return this.rws.status;
    }

    public get ready(): boolean {
        return this.isReady;
    }

    public onSocketStateChange(cb: (status: ConnectionStatus) => void): () => void {
        return this.rws.onSocketStateChange(cb);
    }

    public onReady(cb: ReadyCallback): () => void {
        this.readyCallbacks.add(cb);
        if (this.isReady) cb();
        return () => {
            this.readyCallbacks.delete(cb);
        };
    }

    public destroy() {
        this.readyCallbacks.clear();
        this.rws.destroy();
    }

    public sendRaw(data: string | Blob | BufferSource): void {
        if (!this.isAuthenticated) return;
        if (this.rws.status !== 'connected') return;
        this.rws.send(data);
    }

    public sendJSON(data: GSMessage): void {
        this.sendRaw(JSON.stringify(data));
    }

    private async handleOpen() {
        const auth = this.opts.auth ?? { kind: 'none' };
        this.isAuthenticated = auth.kind === 'none';
        this.isReady = false;
        await this.opts.onOpen?.();

        let deviceIdentity: DeviceIdentity | null = null;
        const mayNneedDeviceIdentity =
            auth.kind === 'wall' || auth.kind === 'controller' || auth.kind === 'gallery';
        if (mayNneedDeviceIdentity) {
            try {
                deviceIdentity = await getOrCreateDeviceIdentity(auth.kind);
            } catch (error) {
                console.warn(
                    '[BusClient] Device identity unavailable, continuing without device key',
                    error
                );
            }
        }
        this.pendingDeviceIdentity = deviceIdentity;

        const hello = this.buildHelloForAuth(auth, deviceIdentity?.publicKey);
        if (hello) {
            this.rws.send(JSON.stringify(hello));
        }
    }

    private buildHelloForAuth(
        auth: BusClientAuth,
        devicePublicKey: string | undefined
    ): HelloMessage | null {
        if (auth.kind === 'none') return null;

        if (auth.kind === 'editor') {
            return {
                type: 'hello',
                specimen: 'editor'
            };
        }

        if (auth.kind === 'wall') {
            return {
                type: 'hello',
                specimen: 'wall',
                wallId: auth.wallId,
                col: auth.col,
                row: auth.row,
                ...(devicePublicKey ? { devicePublicKey } : {})
            };
        }

        if (auth.kind === 'controller') {
            return {
                type: 'hello',
                specimen: 'controller',
                wallId: auth.wallId,
                ...(devicePublicKey ? { devicePublicKey } : {})
            };
        }

        return {
            type: 'hello',
            specimen: 'gallery',
            ...(auth.wallId ? { wallId: auth.wallId } : {}),
            ...(devicePublicKey ? { devicePublicKey } : {})
        };
    }

    private handleAuthMessage(event: MessageEvent): boolean {
        if (typeof event.data !== 'string') return false;

        let parsed: GSMessage;
        try {
            parsed = JSON.parse(event.data) as GSMessage;
        } catch {
            return false;
        }

        if (parsed.type === 'hello_challenge') {
            void this.respondToHelloChallenge(parsed);
            return true;
        }

        if (parsed.type === 'hello_authenticated') {
            this.isAuthenticated = true;
            this.isReady = true;
            for (const cb of this.readyCallbacks) cb();
            return true;
        }

        return false;
    }

    private async respondToHelloChallenge(challenge: HelloChallengeMessage) {
        const auth = this.opts.auth ?? { kind: 'none' };
        if (auth.kind === 'none' || this.rws.status !== 'connected') return;

        const proof = await this.buildHelloProof(challenge, auth);
        if (!proof) return;

        const payload: HelloAuthMessage = {
            type: 'hello_auth',
            proof
        };
        this.rws.send(JSON.stringify(payload));
    }

    private async buildHelloProof(
        challenge: HelloChallengeMessage,
        auth: BusClientAuth
    ): Promise<HelloAuthMessage['proof'] | null> {
        const proof: HelloAuthMessage['proof'] = {};

        const identity =
            this.pendingDeviceIdentity ??
            (auth.kind === 'wall' || auth.kind === 'controller' || auth.kind === 'gallery'
                ? await getOrCreateDeviceIdentity(auth.kind)
                : null);
        if (identity) {
            try {
                proof.signature = await identity.signDeviceId(challenge.nonce);
            } catch (error) {
                console.warn('[BusClient] Failed to sign hello challenge', error);
            }
        }

        if (
            auth.kind === 'controller' &&
            typeof auth.portalToken === 'string' &&
            auth.portalToken.trim().length > 0
        ) {
            proof.portalToken = auth.portalToken;
        }

        if (!proof.signature && !proof.portalToken) {
            return null;
        }

        return proof;
    }
}
