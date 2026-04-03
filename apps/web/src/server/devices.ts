import '@tanstack/react-start/server-only';
import { ObjectId } from 'mongodb';

import { logAuditSuccess } from '~/server/audit';
import { collections } from '~/server/collections';

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

const devices = collections.devices;
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

function serializeDevice(doc: any): DeviceRecord {
    return {
        deviceId: String(doc.deviceId ?? doc._id?.toHexString?.() ?? ''),
        publicKey: String(doc.publicKey ?? ''),
        kind: (doc.kind ?? 'wall') as DeviceKind,
        status: (doc.status ?? 'pending') as DeviceStatus,
        assignedWallId: doc.assignedWallId ? String(doc.assignedWallId) : null,
        createdAt: String(doc.createdAt ?? ''),
        updatedAt: String(doc.updatedAt ?? ''),
        lastSeenAt: doc.lastSeenAt ? String(doc.lastSeenAt) : null
    };
}

export async function ensureDeviceByPublicKey(input: {
    publicKey: string;
    kind: DeviceKind;
}): Promise<DeviceRecord> {
    const publicKey = input.publicKey.trim();
    if (!publicKey) throw new Error('Device public key is required');

    const now = new Date().toISOString();
    const existing = await devices.findOne({ publicKey });
    if (existing) {
        await devices.updateOne(
            { _id: existing._id },
            {
                $set: {
                    lastSeenAt: now,
                    updatedAt: now
                }
            }
        );
        await logAuditSuccess({
            action: 'DEVICE_SEEN',
            resourceType: 'device',
            resourceId: String(existing.deviceId ?? existing._id?.toHexString?.() ?? ''),
            changes: { kind: input.kind }
        });
        return serializeDevice({
            ...existing,
            lastSeenAt: now,
            updatedAt: now
        });
    }

    const deviceId = new ObjectId().toHexString();
    const created = {
        deviceId,
        publicKey,
        kind: input.kind,
        status: 'pending' as const,
        assignedWallId: null,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now
    };
    await devices.insertOne(created);
    await logAuditSuccess({
        action: 'DEVICE_CREATED',
        resourceType: 'device',
        resourceId: deviceId,
        changes: { kind: input.kind, status: 'pending' }
    });
    return serializeDevice(created);
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

    const device = await devices.findOne({ deviceId });
    if (!device) throw new Error('Unknown device');
    if (device.kind !== input.kind) throw new Error('Device kind mismatch');
    if (device.status === 'revoked') throw new Error('Device is revoked');
    if (device.assignedWallId || device.status === 'active') {
        throw new Error('Device is already enrolled');
    }

    const valid = await verifySignature(String(device.publicKey ?? ''), deviceId, signature);
    if (!valid) throw new Error('Invalid device signature');

    const now = new Date().toISOString();
    const result = await devices.findOneAndUpdate(
        { _id: device._id, status: { $ne: 'revoked' }, assignedWallId: null },
        {
            $set: {
                assignedWallId: wallId,
                status: 'active',
                assignedAt: now,
                assignedBy: input.assignedBy,
                updatedAt: now
            }
        },
        { returnDocument: 'after' }
    );
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
    const docs = await devices.find().sort({ updatedAt: -1 }).toArray();
    return docs.map(serializeDevice);
}

export async function markDeviceDisconnectedById(deviceId: string) {
    const normalized = deviceId.trim();
    if (!normalized) return;
    const now = new Date().toISOString();
    await devices.updateOne(
        { deviceId: normalized },
        {
            $set: {
                lastSeenAt: now,
                updatedAt: now
            }
        }
    );
}
