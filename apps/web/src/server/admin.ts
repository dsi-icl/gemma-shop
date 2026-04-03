import '@tanstack/react-start/server-only';
import { auth } from '@repo/auth/auth';
import { createSmtpTransport } from '@repo/auth/smtp';
import { getSmtpConfig, listConfigEntries, setConfigValue } from '@repo/db/config';
import { getRequest } from '@tanstack/react-start/server';
import { ObjectId } from 'mongodb';

import {
    getBusRuntimeTelemetry,
    getIntendedWallNodeCount,
    getWallNodeCount,
    hydrateWallNodes,
    notifyControllers,
    peerCounts,
    unbindWall,
    wallsByWallId
} from '~/lib/busState';
import { logAuditSuccess } from '~/server/audit';
import { collections } from '~/server/collections';
import { adminEnrollDeviceBySignature, adminListDevices } from '~/server/devices';
import { serializeForClient } from '~/server/serialization';
import { serializeAsset } from '~/server/serializers/asset.serializer';
import { serializeProject } from '~/server/serializers/project.serializer';
import { serializeWall } from '~/server/serializers/wall.serializer';

let prevCpuUsage = process.cpuUsage();
let prevCpuAt = process.hrtime.bigint();
let prevBusSample: {
    at: number;
    incomingTotal: number;
    outgoingTotal: number;
} | null = null;

type UserDoc = {
    _id?: ObjectId;
    id?: string;
    email?: string;
    [key: string]: unknown;
};

type SessionDoc = {
    userId?: string | ObjectId;
};

type DeviceDoc = {
    _id?: ObjectId;
    [key: string]: unknown;
};

type WallDoc = {
    _id: ObjectId;
    wallId: string;
    [key: string]: unknown;
};

function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toWallDoc(raw: unknown): WallDoc | null {
    if (!raw || typeof raw !== 'object') return null;
    const wallIdValue = Reflect.get(raw, 'wallId');
    const wallId = typeof wallIdValue === 'string' ? wallIdValue : null;
    if (!wallId) return null;
    const rawId = Reflect.get(raw, '_id');
    if (!(rawId instanceof ObjectId)) return null;
    return { ...raw, wallId, _id: rawId };
}

async function findWallById(identifier: string) {
    const normalized = identifier.trim();
    if (!normalized) return null;

    const exactRaw = await collections.walls.findOne({ wallId: normalized });
    const exact = toWallDoc(exactRaw);
    if (exact) return exact;

    const whitespaceTolerantRaw = await collections.walls.findOne({
        wallId: { $regex: `^\\s*${escapeRegex(normalized)}\\s*$`, $options: 'i' }
    });
    const whitespaceTolerant = toWallDoc(whitespaceTolerantRaw);
    if (whitespaceTolerant) return whitespaceTolerant;

    if (ObjectId.isValid(normalized)) {
        const byIdRaw = await collections.walls.findOne({ _id: new ObjectId(normalized) });
        const byId = toWallDoc(byIdRaw);
        if (byId) return byId;
    }

    return null;
}

export async function adminListUsers() {
    const users = collections.users;
    const sessions = collections.sessions;

    const [docs, activeSessions] = await Promise.all([
        users.find<UserDoc>({}).sort({ createdAt: -1 }).limit(500).toArray(),
        sessions
            .find<SessionDoc>({ expiresAt: { $gt: new Date() } })
            .project({ userId: 1 })
            .toArray()
    ]);

    const activeUserIds = new Set(activeSessions.map((s) => String(s.userId)));

    return docs.map((doc) => {
        const id = String(doc.id ?? doc._id?.toHexString?.() ?? doc._id);
        return serializeForClient({
            ...doc,
            id,
            _id: doc._id?.toHexString?.() ?? id,
            isActiveSession: activeUserIds.has(id)
        });
    });
}

export async function adminListProjects() {
    const projects = collections.projects;
    const docs = await projects.find().sort({ updatedAt: -1 }).toArray();
    return docs.map(serializeProject);
}

export async function adminGetStats() {
    const [userCount, projectCount, commitCount, assetCount] = await Promise.all([
        collections.users.countDocuments(),
        collections.projects.countDocuments(),
        collections.commits.countDocuments(),
        collections.assets.countDocuments({ deletedAt: { $exists: false } })
    ]);
    const wallDocs = await collections.walls
        .find<Record<string, unknown>>({})
        .project({ wallId: 1 })
        .toArray();
    const wallSummary: Record<string, number> = {};
    for (const wall of wallDocs) {
        const wallId = typeof wall.wallId === 'string' ? wall.wallId : '';
        if (!wallId) continue;
        wallSummary[wallId] = getWallNodeCount(wallId);
    }

    const mem = process.memoryUsage();
    const nowHr = process.hrtime.bigint();
    const cpuUsage = process.cpuUsage(prevCpuUsage);
    const elapsedUs = Number(nowHr - prevCpuAt) / 1000;
    const cpuPercent =
        elapsedUs > 0
            ? Math.max(0, Math.min(100, ((cpuUsage.user + cpuUsage.system) / elapsedUs) * 100))
            : 0;
    prevCpuUsage = process.cpuUsage();
    prevCpuAt = nowHr;

    const bus = getBusRuntimeTelemetry();
    const incomingTotal = bus.incomingJson + bus.incomingBinary;
    const outgoingTotal = bus.outgoingJson + bus.outgoingBinary;
    let incomingPerSec = 0;
    let outgoingPerSec = 0;
    const nowMs = Date.now();
    if (prevBusSample) {
        const dtSec = Math.max(0.001, (nowMs - prevBusSample.at) / 1000);
        incomingPerSec = Math.max(0, (incomingTotal - prevBusSample.incomingTotal) / dtSec);
        outgoingPerSec = Math.max(0, (outgoingTotal - prevBusSample.outgoingTotal) / dtSec);
    }
    prevBusSample = { at: nowMs, incomingTotal, outgoingTotal };

    return {
        db: { users: userCount, projects: projectCount, commits: commitCount, assets: assetCount },
        live: { ...peerCounts },
        uptime: process.uptime(),
        walls: wallSummary,
        system: {
            cpuPercent,
            rssMb: mem.rss / 1024 / 1024,
            heapUsedMb: mem.heapUsed / 1024 / 1024,
            heapTotalMb: mem.heapTotal / 1024 / 1024
        },
        bus: {
            ...bus,
            incomingPerSec,
            outgoingPerSec
        }
    };
}

export async function adminListWalls() {
    const walls = collections.walls;
    const connectedDeviceIdsByWallId = new Map<string, Set<string>>();
    const allConnectedDeviceIds = new Set<string>();
    for (const [wallId, wallPeers] of wallsByWallId) {
        let perWall = connectedDeviceIdsByWallId.get(wallId);
        if (!perWall) {
            perWall = new Set<string>();
            connectedDeviceIdsByWallId.set(wallId, perWall);
        }
        for (const entry of wallPeers) {
            if (entry.meta.specimen !== 'wall') continue;
            const deviceId = entry.meta.authContext?.device?.id;
            if (typeof deviceId === 'string' && deviceId.length > 0) {
                perWall.add(deviceId);
                allConnectedDeviceIds.add(deviceId);
            }
        }
    }

    const [docsRaw, wallDeviceCounts, connectedAssignedDevices] = await Promise.all([
        walls.find({}).sort({ lastSeen: -1 }).toArray(),
        collections.devices
            .aggregate<{ _id: string; total: number }>([
                {
                    $match: {
                        kind: 'wall',
                        assignedWallId: { $type: 'string', $ne: null },
                        status: { $ne: 'revoked' }
                    }
                },
                {
                    $group: {
                        _id: '$assignedWallId',
                        total: { $sum: 1 }
                    }
                }
            ])
            .toArray(),
        allConnectedDeviceIds.size > 0
            ? collections.devices
                  .find<{
                      deviceId?: string;
                      assignedWallId?: string | null;
                  }>({
                      deviceId: { $in: Array.from(allConnectedDeviceIds) },
                      kind: 'wall',
                      assignedWallId: { $type: 'string', $ne: null },
                      status: { $ne: 'revoked' }
                  })
                  .project({ deviceId: 1, assignedWallId: 1 })
                  .toArray()
            : Promise.resolve([])
    ]);
    const docs = docsRaw.map(serializeWall);
    const assignedStatsByWallId = new Map(
        wallDeviceCounts.map((entry) => [
            String(entry._id),
            {
                total: Number(entry.total ?? 0)
            }
        ])
    );
    const assignedWallIdByDeviceId = new Map<string, string>();
    for (const doc of connectedAssignedDevices) {
        const deviceId = typeof doc.deviceId === 'string' ? doc.deviceId : null;
        const assignedWallId = typeof doc.assignedWallId === 'string' ? doc.assignedWallId : null;
        if (!deviceId || !assignedWallId) continue;
        assignedWallIdByDeviceId.set(deviceId, assignedWallId);
    }
    return docs.map((doc) => ({
        ...doc,
        assignedConnectedNodes: (() => {
            const wallId = String(doc.wallId ?? '');
            const connectedForWall = connectedDeviceIdsByWallId.get(wallId);
            if (!connectedForWall || connectedForWall.size === 0) return 0;
            let total = 0;
            for (const deviceId of connectedForWall) {
                if (assignedWallIdByDeviceId.get(deviceId) === wallId) total += 1;
            }
            return total;
        })(),
        assignedScreenCount: assignedStatsByWallId.get(String(doc.wallId ?? ''))?.total ?? 0,
        intendedConnectedNodes: getIntendedWallNodeCount(String(doc.wallId ?? ''))
    }));
}

export async function adminCreateWall(input: { wallId: string; name?: string | null }) {
    const wallId = input.wallId.trim();
    if (!wallId) throw new Error('Wall ID is required');
    const now = new Date().toISOString();

    const existing = await collections.walls.findOne({ wallId });
    if (existing) throw new Error('Wall already exists');

    const doc = {
        wallId,
        name: input.name?.trim() || wallId,
        lastSeen: now,
        boundProjectId: null,
        boundCommitId: null,
        boundSlideId: null,
        boundSource: null,
        site: null,
        notes: null,
        createdAt: now,
        updatedAt: now
    };
    const result = await collections.walls.insertOne(doc);
    await logAuditSuccess({
        action: 'WALL_CREATED',
        resourceType: 'wall',
        resourceId: wallId,
        changes: { name: doc.name }
    });
    return serializeWall({ ...doc, _id: result.insertedId });
}

export async function adminGetWall(wallId: string) {
    const targetWallId = wallId.trim();
    if (!targetWallId) throw new Error('Wall ID is required');
    const doc = await findWallById(targetWallId);
    if (!doc) throw new Error('Wall not found');
    const serialized = serializeWall(doc);
    return {
        wallId: String(serialized.wallId ?? targetWallId),
        name: serialized.name ? String(serialized.name) : null
    };
}

export async function adminUpdateWallMetadata(input: {
    wallId: string;
    name?: string | null;
    site?: string | null;
    notes?: string | null;
}): Promise<{ ok: true }> {
    const wallId = input.wallId.trim();
    if (!wallId) throw new Error('Wall ID is required');
    const update = {
        name: input.name?.trim() || wallId,
        site: input.site?.trim() || null,
        notes: input.notes?.trim() || null,
        updatedAt: new Date().toISOString()
    };

    const existing = await findWallById(wallId);
    if (!existing) throw new Error('Wall not found');

    const resultRaw = await collections.walls.findOneAndUpdate(
        { _id: existing._id },
        { $set: update },
        { returnDocument: 'after' }
    );
    const result = toWallDoc(resultRaw);
    if (!result) throw new Error('Wall not found');
    await logAuditSuccess({
        action: 'WALL_UPDATED',
        resourceType: 'wall',
        resourceId: String(existing.wallId ?? wallId),
        changes: update
    });
    return { ok: true };
}

export async function adminDeleteWall(wallId: string) {
    const targetWallId = wallId.trim();
    if (!targetWallId) throw new Error('Wall ID is required');
    const existing = await findWallById(targetWallId);
    if (!existing) throw new Error('Wall not found');
    const resolvedWallId = String(existing.wallId ?? targetWallId).trim();

    unbindWall(resolvedWallId);
    hydrateWallNodes(resolvedWallId);
    notifyControllers(resolvedWallId, false);

    const now = new Date().toISOString();
    await Promise.all([
        collections.walls.deleteOne({ _id: existing._id }),
        collections.devices.updateMany(
            { assignedWallId: resolvedWallId },
            {
                $set: {
                    assignedWallId: null,
                    status: 'pending',
                    updatedAt: now
                }
            }
        )
    ]);
    await logAuditSuccess({
        action: 'WALL_DELETED',
        resourceType: 'wall',
        resourceId: resolvedWallId
    });

    process.__BROADCAST_WALL_BINDING_CHANGED__?.(resolvedWallId);
}

export async function adminListDevicesForWall(wallId: string) {
    const targetWallId = wallId.trim();
    if (!targetWallId) throw new Error('Wall ID is required');
    const existing = await findWallById(targetWallId);
    if (!existing) throw new Error('Wall not found');
    const resolvedWallId = String(existing.wallId ?? targetWallId).trim();
    const docs = await collections.devices
        .find<DeviceDoc>({ assignedWallId: resolvedWallId })
        .sort({ updatedAt: -1 })
        .toArray();
    return docs.map((doc) =>
        serializeForClient({
            ...doc,
            _id: doc._id?.toHexString?.() ?? null
        })
    );
}

export async function adminGetWallBindingMeta(input: {
    boundProjectId?: string | null;
    boundCommitId?: string | null;
    boundSlideId?: string | null;
}) {
    const { boundProjectId, boundCommitId, boundSlideId } = input;
    if (!boundProjectId) {
        return { projectName: null, slideName: null };
    }

    let projectName: string | null = null;
    let slideName: string | null = null;

    try {
        const project = await collections.projects.findOne(
            { _id: new ObjectId(boundProjectId) },
            { projection: { name: 1 } }
        );
        projectName = project?.name ? String(project.name) : null;
    } catch {
        // Keep null fallback when IDs are malformed or project does not exist.
    }

    if (boundCommitId && boundSlideId) {
        try {
            const commit = await collections.commits.findOne(
                { _id: new ObjectId(boundCommitId) },
                { projection: { 'content.slides.id': 1, 'content.slides.name': 1 } }
            );
            const rawSlides = commit?.content?.slides;
            if (Array.isArray(rawSlides)) {
                const slide = rawSlides.find(
                    (entry) =>
                        entry &&
                        typeof entry === 'object' &&
                        Reflect.get(entry, 'id') === boundSlideId
                );
                const maybeName = slide ? Reflect.get(slide, 'name') : null;
                slideName =
                    typeof maybeName === 'string' && maybeName.length > 0 ? maybeName : null;
            }
        } catch {
            // Keep null fallback when IDs are malformed or commit does not exist.
        }
    }

    return { projectName, slideName };
}

export async function adminUnbindWall(wallId: string) {
    unbindWall(wallId);
    hydrateWallNodes(wallId);
    notifyControllers(wallId, false);

    await collections.walls.updateOne(
        { wallId },
        {
            $set: {
                boundProjectId: null,
                boundCommitId: null,
                boundSlideId: null,
                boundSource: null,
                updatedAt: new Date().toISOString()
            }
        }
    );
    await logAuditSuccess({
        action: 'WALL_UNBOUND',
        resourceType: 'wall',
        resourceId: wallId
    });

    process.__BROADCAST_WALL_BINDING_CHANGED__?.(wallId);
}

export async function adminDevicesList() {
    return adminListDevices();
}

export async function adminDevicesEnrollBySignature(input: {
    deviceId: string;
    signature: string;
    kind: 'wall' | 'gallery' | 'controller';
    wallId: string;
    assignedBy: string;
}) {
    const wall = await findWallById(input.wallId);
    if (!wall) throw new Error('Wall not found');
    const resolvedWallId = String(wall.wallId ?? input.wallId).trim();
    const enrolled = await adminEnrollDeviceBySignature({
        ...input,
        wallId: resolvedWallId
    });
    process.__REBOOT_DEVICE__?.(enrolled.deviceId);
    return enrolled;
}

export async function adminDeleteDevice(input: { deviceId: string; deletedBy: string }) {
    const deviceId = input.deviceId.trim();
    if (!deviceId) throw new Error('Device ID is required');

    const existing = await collections.devices.findOne({ deviceId }, { projection: { _id: 1 } });
    if (!existing) throw new Error('Device not found');

    await collections.devices.deleteOne({ _id: existing._id });
    await logAuditSuccess({
        action: 'DEVICE_DELETED',
        actorId: input.deletedBy,
        resourceType: 'device',
        resourceId: deviceId
    });
    // Guarantee disconnection of any live WS peers authenticated with this device.
    process.__DISCONNECT_DEVICE__?.(deviceId);

    return { ok: true };
}

export async function adminRecomputeBusAuthContext(input: { email?: string }) {
    const payload = {
        ...(input.email ? { email: input.email } : {})
    };

    const [busSettled, yjsSettled] = await Promise.allSettled([
        process.__BUS_RECOMPUTE_AUTH_CONTEXT__?.(payload),
        process.__YJS_RECOMPUTE_AUTH_CONTEXT__?.(payload)
    ]);

    if (busSettled.status === 'rejected') {
        console.warn('[Admin] BUS auth-context recompute failed', busSettled.reason);
    }
    if (yjsSettled.status === 'rejected') {
        console.warn('[Admin] YJS auth-context recompute failed', yjsSettled.reason);
    }

    return {
        bus: busSettled.status === 'fulfilled' ? busSettled.value : null,
        yjs: yjsSettled.status === 'fulfilled' ? yjsSettled.value : null
    };
}

export async function adminSetUserBanStatus(input: {
    userId: string;
    banned: boolean;
    actorEmail: string;
}) {
    const userId = input.userId.trim();
    if (!userId) throw new Error('User ID is required');

    const users = collections.users;

    const user = await users.findOne({ id: userId }, { projection: { email: 1, id: 1 } });
    if (!user) throw new Error('User not found');
    if (user.email === input.actorEmail)
        throw new Error('You cannot modify your own account status');

    const headers = getRequest().headers;

    if (input.banned) {
        await auth.api.banUser({
            headers,
            body: { userId }
        });
    } else {
        await auth.api.unbanUser({
            headers,
            body: { userId }
        });
    }

    if (typeof user.email === 'string' && user.email.length > 0) {
        await adminRecomputeBusAuthContext({ email: user.email });
    }

    await logAuditSuccess({
        action: input.banned ? 'ADMIN_USER_BANNED' : 'ADMIN_USER_UNBANNED',
        actorId: input.actorEmail,
        resourceType: 'user',
        resourceId: userId,
        changes: { banned: input.banned }
    });
}

export async function adminListPublicAssets() {
    const docs = await collections.assets
        .find({ public: true, deletedAt: { $exists: false } })
        .sort({ createdAt: -1 })
        .toArray();
    return docs.map(serializeAsset);
}

export async function adminDeletePublicAsset(assetId: string, userEmail: string) {
    const assets = collections.assets;
    const asset = await assets.findOne({
        _id: new ObjectId(assetId),
        public: true,
        deletedAt: { $exists: false }
    });
    if (!asset) throw new Error('Public asset not found');

    await assets.updateOne(
        { _id: new ObjectId(assetId) },
        {
            $set: {
                deletedAt: new Date().toISOString(),
                deletedBy: userEmail
            }
        }
    );
    await logAuditSuccess({
        action: 'PUBLIC_ASSET_DELETED',
        actorId: userEmail,
        projectId: asset.projectId,
        resourceType: 'asset',
        resourceId: assetId
    });
}

type ConfigField = {
    key: string;
    label: string;
    encrypted: boolean;
    type: 'string' | 'number' | 'boolean' | 'secret';
    placeholder?: string;
};

export const ADMIN_CONFIG_FIELDS: ConfigField[] = [
    {
        key: 'smtp.host',
        label: 'SMTP Host',
        encrypted: false,
        type: 'string',
        placeholder: 'smtp.example.com'
    },
    { key: 'smtp.port', label: 'SMTP Port', encrypted: false, type: 'number', placeholder: '587' },
    { key: 'smtp.secure', label: 'SMTP Secure', encrypted: false, type: 'boolean' },
    { key: 'smtp.requireTLS', label: 'SMTP Require TLS', encrypted: false, type: 'boolean' },
    { key: 'smtp.ignoreTLS', label: 'SMTP Ignore TLS', encrypted: false, type: 'boolean' },
    {
        key: 'smtp.tlsRejectUnauthorized',
        label: 'SMTP TLS Reject Unauthorized',
        encrypted: false,
        type: 'boolean'
    },
    {
        key: 'smtp.tlsServername',
        label: 'SMTP TLS Server Name',
        encrypted: false,
        type: 'string',
        placeholder: 'smtp.example.com'
    },
    {
        key: 'smtp.connectionTimeoutMs',
        label: 'SMTP Connection Timeout (ms)',
        encrypted: false,
        type: 'number',
        placeholder: '10000'
    },
    { key: 'smtp.user', label: 'SMTP Username', encrypted: false, type: 'string' },
    { key: 'smtp.pass', label: 'SMTP Password', encrypted: true, type: 'secret' },
    {
        key: 'smtp.from',
        label: 'SMTP From Address',
        encrypted: false,
        type: 'string',
        placeholder: 'noreply@example.com'
    }
];

export async function adminListConfig() {
    const entries = await listConfigEntries();
    const byKey = new Map(entries.map((entry) => [entry.key, entry]));

    return ADMIN_CONFIG_FIELDS.map((field) => {
        const current = byKey.get(field.key);
        return {
            ...field,
            value: current?.value ?? null,
            isSet: current?.isSet ?? false,
            updatedAt: current?.updatedAt ?? null,
            updatedBy: current?.updatedBy ?? null,
            version: current?.version ?? 0
        };
    });
}

function normalizeConfigValue(field: ConfigField, value: string): unknown {
    if (field.type === 'number') {
        const num = Number(value);
        if (!Number.isFinite(num)) throw new Error(`${field.label} must be a valid number`);
        return num;
    }
    if (field.type === 'boolean') {
        return value === 'true';
    }
    return value;
}

export async function adminSetConfig(input: { key: string; value: string; updatedBy: string }) {
    const field = ADMIN_CONFIG_FIELDS.find((f) => f.key === input.key);
    if (!field) throw new Error('Unsupported config key');

    if (field.encrypted && input.value.trim() === '') {
        throw new Error(`${field.label} cannot be empty`);
    }

    await setConfigValue({
        key: field.key,
        value: normalizeConfigValue(field, input.value),
        encrypted: field.encrypted,
        updatedBy: input.updatedBy
    });
}

export async function adminSendSmtpTest(input: { to: string }) {
    const smtp = await getSmtpConfig();
    if (!smtp) {
        throw new Error(
            'SMTP configuration is incomplete. Please configure all SMTP fields first.'
        );
    }

    const transporter = await createSmtpTransport(smtp);

    await transporter.sendMail({
        from: smtp.from,
        to: input.to,
        subject: 'Gemma Shop SMTP test',
        html: '<p>This is a test email from Gemma Shop admin configuration.</p>'
    });

    return { ok: true };
}
