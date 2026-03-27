import '@tanstack/react-start/server-only';
import { db } from '@repo/db';
import { ObjectId } from 'mongodb';

export type DeviceKind = 'wall' | 'gallery' | 'controller';
export type DeviceStatus = 'pending' | 'active' | 'revoked';

export interface DeviceRecord {
    deviceId: string;
    publicKey: string;
    kind: DeviceKind;
    status: DeviceStatus;
    assignedWallId: string | null;
    challenge: string;
    createdAt: string;
    updatedAt: string;
    lastSeenAt: string | null;
}

const devices = db.collection('devices');
const CHALLENGE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CHALLENGE_LENGTH = 8;

function randomChallenge(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(CHALLENGE_LENGTH));
    let out = '';
    for (let i = 0; i < CHALLENGE_LENGTH; i++) {
        out += CHALLENGE_ALPHABET[bytes[i] % CHALLENGE_ALPHABET.length];
    }
    return out;
}

async function generateUniqueChallenge(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
        const challenge = randomChallenge();
        const existing = await devices.findOne({ challenge }, { projection: { _id: 1 } });
        if (!existing) return challenge;
    }
    throw new Error('Could not generate unique device challenge');
}

function serializeDevice(doc: any): DeviceRecord {
    return {
        deviceId: String(doc.deviceId ?? doc._id?.toHexString?.() ?? ''),
        publicKey: String(doc.publicKey ?? ''),
        kind: (doc.kind ?? 'wall') as DeviceKind,
        status: (doc.status ?? 'pending') as DeviceStatus,
        assignedWallId: doc.assignedWallId ? String(doc.assignedWallId) : null,
        challenge: String(doc.challenge ?? ''),
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
                    kind: input.kind,
                    lastSeenAt: now,
                    updatedAt: now
                }
            }
        );
        return serializeDevice({
            ...existing,
            kind: input.kind,
            lastSeenAt: now,
            updatedAt: now
        });
    }

    const challenge = await generateUniqueChallenge();
    const deviceId = new ObjectId().toHexString();
    const created = {
        deviceId,
        publicKey,
        kind: input.kind,
        status: 'pending' as const,
        assignedWallId: null,
        challenge,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now
    };
    await devices.insertOne(created);
    return serializeDevice(created);
}

export async function adminAssignDeviceByChallenge(input: {
    challenge: string;
    wallId: string;
    assignedBy: string;
}): Promise<DeviceRecord> {
    const challenge = input.challenge.trim().toUpperCase();
    const wallId = input.wallId.trim();
    if (!challenge) throw new Error('Challenge is required');
    if (!wallId) throw new Error('Wall ID is required');

    const now = new Date().toISOString();
    const result = await devices.findOneAndUpdate(
        { challenge, status: { $ne: 'revoked' } },
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
    if (!result) throw new Error('Device challenge not found');
    return serializeDevice(result);
}

export async function adminListDevices() {
    const docs = await devices.find().sort({ updatedAt: -1 }).toArray();
    return docs.map(serializeDevice);
}
