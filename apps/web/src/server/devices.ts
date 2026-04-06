import '@tanstack/react-start/server-only';
import type { PublicDoc } from '@repo/db/collections';
import type { DeviceDocument } from '@repo/db/documents';

import { logAuditSuccess } from '~/server/audit';
import { dbCol } from '~/server/collections';
import { epochToISO } from '~/server/serialization';

export type DeviceKind = 'wall' | 'gallery' | 'controller';
export type DeviceStatus = 'pending' | 'active' | 'revoked';

export interface DeviceRecord {
    deviceId: string;
    publicKey: string;
    kind: DeviceKind;
    status: DeviceStatus;
    assignedWallId: string | null;
    createdAt: string;
    updatedAt: string;
    lastSeenAt: string | null;
}

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

export function serializeDevice(device: PublicDoc<DeviceDocument>): DeviceRecord {
    return {
        deviceId: device.deviceId,
        publicKey: device.publicKey,
        kind: device.kind,
        status: device.status,
        assignedWallId: device.assignedWallId ?? null,
        createdAt: epochToISO(device.createdAt),
        updatedAt: epochToISO(device.updatedAt),
        lastSeenAt: device.lastSeenAt != null ? epochToISO(device.lastSeenAt) : null
    };
}

async function verifySignature(publicKeyJwkJson: string, deviceId: string, signature: string) {
    const pub = JSON.parse(publicKeyJwkJson) as JsonWebKey;
    const key = await crypto.subtle.importKey('jwk', pub, ALGO, false, ['verify']);
    const rawSigBytes = fromBase64Url(signature);
    const sigBytes = new Uint8Array(rawSigBytes.byteLength);
    sigBytes.set(rawSigBytes);
    const data = new TextEncoder().encode(deviceId);
    return crypto.subtle.verify(ALGO, key, sigBytes, data);
}

export async function ensureDeviceByPublicKey(input: {
    publicKey: string;
    kind: DeviceKind;
}): Promise<DeviceRecord> {
    const publicKey = input.publicKey.trim();
    if (!publicKey) throw new Error('Device public key is required');

    const now = Date.now();
    const existing = await dbCol.devices.findOne({ publicKey });
    if (existing) {
        await dbCol.devices.touchLastSeen(existing.deviceId);
        await logAuditSuccess({
            action: 'DEVICE_SEEN',
            resourceType: 'device',
            resourceId: existing.deviceId,
            changes: { kind: input.kind }
        });
        return serializeDevice({ ...existing, lastSeenAt: now, updatedAt: now });
    }

    const deviceId = crypto.randomUUID().replace(/-/g, '');
    const created = await dbCol.devices.insert({
        deviceId,
        publicKey,
        kind: input.kind,
        status: 'pending' as const,
        assignedWallId: null,
        lastSeenAt: now
    });
    await logAuditSuccess({
        action: 'DEVICE_CREATED',
        resourceType: 'device',
        resourceId: deviceId,
        changes: { kind: input.kind, status: 'pending' }
    });
    return serializeDevice(created);
}

export async function adminEnrollDeviceBySignature(input: {
    deviceId: string;
    signature: string;
    kind: DeviceKind;
    wallId: string;
    assignedBy: string;
}): Promise<DeviceRecord> {
    const deviceId = input.deviceId.trim();
    const signature = input.signature.trim();
    const wallId = input.wallId.trim();
    if (!deviceId) throw new Error('Device ID is required');
    if (!signature) throw new Error('Signature is required');
    if (!wallId) throw new Error('Wall ID is required');

    const device = await dbCol.devices.findOne({ deviceId });
    if (!device) throw new Error('Unknown device');
    if (device.kind !== input.kind) throw new Error('Device kind mismatch');
    if (device.status === 'revoked') throw new Error('Device is revoked');
    if (device.assignedWallId || device.status === 'active') {
        throw new Error('Device is already enrolled');
    }

    const valid = await verifySignature(String(device.publicKey ?? ''), deviceId, signature);
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
        resourceId: deviceId,
        projectId: null,
        changes: { wallId, kind: input.kind, status: 'active' }
    });
    return serializeDevice(result);
}

export async function adminListDevices() {
    const devices = await dbCol.devices.find({}, { sort: { updatedAt: -1 } });
    return devices.map(serializeDevice);
}

export async function markDeviceDisconnectedById(deviceId: string) {
    const normalized = deviceId.trim();
    if (!normalized) return;
    await dbCol.devices.touchLastSeen(normalized);
}
