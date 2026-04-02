'use client';

import { getOrCreateDeviceIdentity, type DeviceKind as ClientDeviceKind } from './deviceIdentity';
import { type ConnectionStatus, ReconnectingWebSocket } from './reconnectingWs';
import { getWebSocketUrl } from './runtimeUrl';
import type { GSMessage } from './types';

type HelloMessage = Extract<GSMessage, { type: 'hello' }>;

type BusClientAuth =
    | {
          kind: 'none';
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

const getGemmaBusUrl = (): string => {
    return getWebSocketUrl('/bus');
};

export class BusClient {
    private rws: ReconnectingWebSocket;
    private opts: BusClientOptions;

    constructor(options: BusClientOptions) {
        this.opts = options;

        this.rws = new ReconnectingWebSocket(getGemmaBusUrl(), {
            binaryType: 'arraybuffer',
            onOpen: () => {
                void this.handleOpen();
            },
            onMessage: (event) => {
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

    public onStateChange(cb: (status: ConnectionStatus) => void): () => void {
        return this.rws.onStateChange(cb);
    }

    public destroy() {
        this.rws.destroy();
    }

    public sendRaw(data: string | Blob | BufferSource): void {
        if (this.rws.status !== 'connected') return;
        this.rws.send(data);
    }

    public sendJSON(data: GSMessage): void {
        this.sendRaw(JSON.stringify(data));
    }

    private async handleOpen() {
        await this.opts.onOpen?.();

        let devicePublicKey: string | undefined;
        const auth = this.opts.auth ?? { kind: 'none' };

        const deviceKind = this.getDeviceKindForAuth(auth);
        if (deviceKind) {
            try {
                const identity = await getOrCreateDeviceIdentity(deviceKind);
                devicePublicKey = identity.publicKey;
            } catch (error) {
                console.warn(
                    '[BusClient] Device identity unavailable, continuing without device key',
                    error
                );
            }
        }

        const hello = this.buildHelloForAuth(auth, devicePublicKey);
        if (hello) {
            this.rws.send(JSON.stringify(hello));
        }
    }

    private buildHelloForAuth(
        auth: BusClientAuth,
        devicePublicKey: string | undefined
    ): HelloMessage | null {
        if (auth.kind === 'none') return null;

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

    private getDeviceKindForAuth(auth: BusClientAuth): ClientDeviceKind | null {
        if (auth.kind === 'none') return null;
        return auth.kind;
    }
}
