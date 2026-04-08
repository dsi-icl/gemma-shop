import { randomBytes } from 'node:crypto';

import type { Peer } from 'crossws';

import { sendJSON } from '~/lib/busState';
import type { GSMessage } from '~/lib/types';

export type HelloMessage = Extract<GSMessage, { type: 'hello' }>;
export type DeviceHelloMessage = Exclude<HelloMessage, { specimen: 'editor' }>;
type HelloChallengeMessage = Extract<GSMessage, { type: 'hello_challenge' }>;

export interface PendingHelloAuth {
    hello: DeviceHelloMessage;
    nonce: string;
}

export const pendingHelloAuthByPeer = new Map<string, PendingHelloAuth>();

export function clearPendingHelloAuth(peerId: string): PendingHelloAuth | null {
    const pending = pendingHelloAuthByPeer.get(peerId);
    if (!pending) return null;
    pendingHelloAuthByPeer.delete(peerId);
    return pending;
}

export function issueHelloChallenge(peer: Peer, hello: DeviceHelloMessage) {
    const pending: PendingHelloAuth = {
        hello,
        nonce: randomBytes(16).toString('base64url')
    };
    pendingHelloAuthByPeer.set(peer.id, pending);
    const challenge: HelloChallengeMessage = {
        type: 'hello_challenge',
        nonce: pending.nonce
    };
    sendJSON(peer, challenge);
}

function base64UrlToBytes(input: string): Uint8Array {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return Uint8Array.from(Buffer.from(padded, 'base64'));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const out = new Uint8Array(bytes.byteLength);
    out.set(bytes);
    return out.buffer;
}

export async function verifyDeviceSignature(
    publicKeyRaw: string,
    nonce: string,
    signatureBase64Url: string
): Promise<boolean> {
    try {
        const jwk = JSON.parse(publicKeyRaw) as JsonWebKey;
        const key = await crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify']
        );
        return crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            key,
            asArrayBuffer(base64UrlToBytes(signatureBase64Url)),
            asArrayBuffer(new TextEncoder().encode(nonce))
        );
    } catch (error) {
        console.warn('[WS] Failed to verify device signature', error);
        return false;
    }
}
