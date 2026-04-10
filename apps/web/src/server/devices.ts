import '@tanstack/react-start/server-only';
import type { PublicDoc } from '@repo/db/collections';
import type { DeviceDocument } from '@repo/db/documents';

import { logAuditSuccess } from '~/server/audit';
import { dbCol } from '~/server/collections';

const ALGO: EcKeyImportParams & EcdsaParams = {
    name: 'ECDSA',
    namedCurve: 'P-256',
    hash: 'SHA-256'
};

function fromBase64Url(input: string): Uint8Array {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = Buffer.from(padded, 'base64');
    return new Uint8Array(binary);
}

async function verifySignature(publicKeyJwkJson: string, id: string, signature: string) {
    const pub = JSON.parse(publicKeyJwkJson) as JsonWebKey;
    const key = await crypto.subtle.importKey('jwk', pub, ALGO, false, ['verify']);
    const rawSigBytes = fromBase64Url(signature);
    const sigBytes = new Uint8Array(rawSigBytes.byteLength);
    sigBytes.set(rawSigBytes);
    const data = new TextEncoder().encode(id);
    return crypto.subtle.verify(ALGO, key, sigBytes, data);
}

function buildDeviceActorId(id: unknown): string | null {
    if (typeof id !== 'string') return null;
    const normalized = id.trim();
    if (!normalized) return null;
    return `device:${normalized}`;
}

export async function ensureDeviceByPublicKey(input: {
    publicKey: string;
    kind: DeviceDocument['kind'];
}): Promise<PublicDoc<DeviceDocument>> {
    const publicKey = input.publicKey.trim();
    if (!publicKey) throw new Error('Device public key is required');

    const now = Date.now();
    const existing = await dbCol.devices.findOne({ publicKey });
    if (existing) {
        await dbCol.devices.touchLastSeen(existing.id);
        const actorId = buildDeviceActorId(existing.id);
        if (actorId) {
            await logAuditSuccess({
                action: 'DEVICE_SEEN',
                actorId,
                resourceType: 'device',
                resourceId: existing.id,
                changes: {
                    kind: input.kind,
                    status: existing.status,
                    wallId: existing.assignedWallId ?? null
                }
            });
        }
        return { ...existing, lastSeenAt: now, updatedAt: now };
    }

    const created = await dbCol.devices.insert({
        publicKey,
        kind: input.kind,
        status: 'pending' as const,
        assignedWallId: null,
        lastSeenAt: now
    });
    await logAuditSuccess({
        action: 'DEVICE_CREATED',
        resourceType: 'device',
        resourceId: created.id,
        changes: { kind: input.kind, status: 'pending' }
    });
    return created;
}

export async function adminEnrollDeviceBySignature(input: {
    id: string;
    signature: string;
    kind: DeviceDocument['kind'];
    wallId: string;
    assignedBy: string;
}): Promise<PublicDoc<DeviceDocument>> {
    const id = input.id.trim();
    const signature = input.signature.trim();
    const wallId = input.wallId.trim();
    if (!id) throw new Error('Device ID is required');
    if (!signature) throw new Error('Signature is required');
    if (!wallId) throw new Error('Wall ID is required');

    const device = await dbCol.devices.findById(id);
    if (!device) throw new Error('Unknown device');
    if (device.kind !== input.kind) throw new Error('Device kind mismatch');
    if (device.status === 'revoked') throw new Error('Device is revoked');
    if (device.assignedWallId || device.status === 'active') {
        throw new Error('Device is already enrolled');
    }

    const valid = await verifySignature(String(device.publicKey ?? ''), id, signature);
    if (!valid) throw new Error('Invalid device signature');

    const now = Date.now();
    const result = await dbCol.devices.enroll(device.id, {
        assignedWallId: wallId,
        assignedBy: input.assignedBy,
        assignedAt: now
    });
    if (!result) throw new Error('Failed to enroll device');
    await logAuditSuccess({
        action: 'DEVICE_ENROLLED',
        actorId: input.assignedBy,
        resourceType: 'device',
        resourceId: id,
        projectId: null,
        changes: { wallId, kind: input.kind, status: 'active' }
    });
    return result;
}

export async function adminListDevices(): Promise<PublicDoc<DeviceDocument>[]> {
    return dbCol.devices.find({}, { sort: { updatedAt: -1 } });
}

export async function markDeviceDisconnectedById(id: string) {
    const normalized = id.trim();
    if (!normalized) return;
    await dbCol.devices.touchLastSeen(normalized);
}
