'use client';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

type StatusCallback = (status: ConnectionStatus) => void;

interface ReconnectingWebSocketOptions {
    onOpen?: () => void;
    onMessage?: (event: MessageEvent) => void;
    binaryType?: BinaryType;
    initialDelay?: number;
    maxDelay?: number;
    multiplier?: number;
    maxAttempts?: number;
}

export class ReconnectingWebSocket {
    public ws!: WebSocket;
    private url: string;
    private opts: Required<
        Omit<ReconnectingWebSocketOptions, 'onOpen' | 'onMessage' | 'binaryType'>
    > &
        Pick<ReconnectingWebSocketOptions, 'onOpen' | 'onMessage' | 'binaryType'>;
    private statusCallbacks = new Set<StatusCallback>();
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private attempt = 0;
    private intentionalClose = false;
    private _status: ConnectionStatus = 'connecting';

    constructor(url: string, options: ReconnectingWebSocketOptions = {}) {
        this.url = url;
        this.opts = {
            initialDelay: 500,
            maxDelay: 15_000,
            multiplier: 2,
            maxAttempts: 20,
            ...options
        };
        this.connect();
    }

    get status(): ConnectionStatus {
        return this._status;
    }

    onStateChange(cb: StatusCallback): () => void {
        this.statusCallbacks.add(cb);
        return () => {
            this.statusCallbacks.delete(cb);
        };
    }

    send(data: string | Blob | BufferSource): void {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(data);
        }
    }

    /** Permanent close — suppresses reconnection. Use for HMR dispose. */
    destroy(): void {
        this.intentionalClose = true;
        this.clearReconnectTimer();
        this.statusCallbacks.clear();
        if (this.ws) {
            this.ws.onopen = null;
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.onmessage = null;
            this.ws.close();
        }
        this.setStatus('disconnected');
    }

    private connect(): void {
        this.ws = new WebSocket(this.url);
        if (this.opts.binaryType) this.ws.binaryType = this.opts.binaryType;

        this.ws.onopen = () => {
            this.attempt = 0;
            this.setStatus('connected');
            this.opts.onOpen?.();
        };

        this.ws.onmessage = (event) => {
            this.opts.onMessage?.(event);
        };

        this.ws.onclose = () => {
            if (!this.intentionalClose) this.scheduleReconnect();
        };

        this.ws.onerror = () => {
            // onerror is always followed by onclose — reconnect handled there
        };
    }

    private scheduleReconnect(): void {
        if (this.attempt >= this.opts.maxAttempts) {
            console.warn(`ReconnectingWebSocket: max attempts (${this.opts.maxAttempts}) reached`);
            this.setStatus('disconnected');
            return;
        }

        this.setStatus('reconnecting');

        const delay = Math.min(
            this.opts.initialDelay * Math.pow(this.opts.multiplier, this.attempt),
            this.opts.maxDelay
        );
        this.attempt++;

        console.log(
            `ReconnectingWebSocket: reconnecting in ${delay}ms (attempt ${this.attempt}/${this.opts.maxAttempts})`
        );

        this.clearReconnectTimer();
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    private setStatus(status: ConnectionStatus): void {
        if (this._status === status) return;
        this._status = status;
        for (const cb of this.statusCallbacks) cb(status);
    }
}
