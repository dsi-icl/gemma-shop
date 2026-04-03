'use client';

import { getOrCreateDeviceIdentity, type DeviceKind } from './deviceIdentity';
import {
    DEVICE_HEADER_BODY_HASH,
    DEVICE_HEADER_KIND,
    DEVICE_HEADER_NONCE,
    DEVICE_HEADER_PUBLIC_KEY,
    DEVICE_HEADER_SIGNATURE,
    DEVICE_HEADER_TIMESTAMP,
    DEVICE_HEADER_WALL_ID,
    buildCanonicalDeviceSignaturePayload
} from './requestSignatureContract';

function toBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function toArrayBufferView(input: Uint8Array): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(input.byteLength);
    out.set(input);
    return out;
}

function makeNonce(): string {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return toBase64Url(bytes);
}

function bodyFromInit(init?: RequestInit): BodyInit | null {
    if (!init) return null;
    if (typeof init.body === 'undefined' || init.body === null) return null;
    return init.body as BodyInit;
}

async function bodyToSha256Base64Url(body: BodyInit | null): Promise<string | null> {
    if (body === null) return null;

    let bytes: Uint8Array | null = null;
    if (typeof body === 'string') {
        bytes = new TextEncoder().encode(body);
    } else if (body instanceof URLSearchParams) {
        bytes = new TextEncoder().encode(body.toString());
    } else if (body instanceof Blob) {
        bytes = new Uint8Array(await body.arrayBuffer());
    } else if (body instanceof ArrayBuffer) {
        bytes = new Uint8Array(body);
    } else if (ArrayBuffer.isView(body)) {
        bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    } else if (body instanceof FormData) {
        // Multipart body encoding is runtime-dependent; skip hash for now.
        return null;
    }

    if (!bytes) return null;
    const digest = await crypto.subtle.digest('SHA-256', toArrayBufferView(bytes));
    return toBase64Url(new Uint8Array(digest));
}

export async function buildDeviceSignatureHeaders(input: {
    deviceKind: DeviceKind;
    url: string;
    method?: string;
    init?: RequestInit;
    wallId?: string;
}): Promise<Record<string, string>> {
    if (typeof window === 'undefined') return {};

    const requestUrl = new URL(input.url, window.location.origin);
    const method = (input.method ?? input.init?.method ?? 'GET').toUpperCase();
    const timestamp = Date.now();
    const nonce = makeNonce();
    const bodySha256 = await bodyToSha256Base64Url(bodyFromInit(input.init));

    const identity = await getOrCreateDeviceIdentity(input.deviceKind);
    const payload = buildCanonicalDeviceSignaturePayload(
        requestUrl,
        method,
        timestamp,
        nonce,
        bodySha256
    );
    const signature = await identity.signPayload(payload);

    const headers: Record<string, string> = {
        [DEVICE_HEADER_KIND]: input.deviceKind,
        [DEVICE_HEADER_PUBLIC_KEY]: identity.publicKey,
        [DEVICE_HEADER_TIMESTAMP]: String(timestamp),
        [DEVICE_HEADER_NONCE]: nonce,
        [DEVICE_HEADER_SIGNATURE]: signature
    };

    if (bodySha256) headers[DEVICE_HEADER_BODY_HASH] = bodySha256;
    if (input.wallId && input.wallId.length > 0) headers[DEVICE_HEADER_WALL_ID] = input.wallId;

    return headers;
}
