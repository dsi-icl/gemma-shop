import '@tanstack/react-start/server-only';
import { db } from '@repo/db';
import { ObjectId } from 'mongodb';

import {
    getBusRuntimeTelemetry,
    hydrateWallNodes,
    notifyControllers,
    peerCounts,
    unbindWall
} from '~/lib/busState';
import { ASSET_DIR } from '~/lib/serverVariables';

let prevCpuUsage = process.cpuUsage();
let prevCpuAt = process.hrtime.bigint();
let prevBusSample: {
    at: number;
    incomingTotal: number;
    outgoingTotal: number;
} | null = null;

function serializeForClient<T>(value: T): T {
    if (value instanceof ObjectId) {
        return value.toHexString() as T;
    }
    if (value instanceof Date) {
        return value.toISOString() as T;
    }
    if (Array.isArray(value)) {
        return value.map((item) => serializeForClient(item)) as T;
    }
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = serializeForClient(v);
        }
        return out as T;
    }
    return value;
}

function serializeAsset(doc: any) {
    return serializeForClient({
        ...doc,
        _id: doc._id.toHexString(),
        projectId: doc.projectId?.toString?.() ?? String(doc.projectId ?? '')
    });
}

export async function adminListUsers() {
    const users = db.collection('user');
    const sessions = db.collection('session');

    const [docs, activeSessions] = await Promise.all([
        users.find().sort({ createdAt: -1 }).limit(500).toArray(),
        sessions
            .find({ expiresAt: { $gt: new Date() } })
            .project({ userId: 1 })
            .toArray()
    ]);

    const activeUserIds = new Set(activeSessions.map((s: any) => String(s.userId)));

    return docs.map((doc: any) => {
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
    const projects = db.collection('projects');
    const docs = await projects.find().sort({ updatedAt: -1 }).toArray();
    return docs.map((doc) =>
        serializeForClient({
            ...doc,
            _id: doc._id.toHexString()
        })
    );
}

export async function adminGetStats() {
    const [userCount, projectCount, commitCount, assetCount] = await Promise.all([
        db.collection('user').countDocuments(),
        db.collection('projects').countDocuments(),
        db.collection('commits').countDocuments(),
        db.collection('assets').countDocuments()
    ]);
    const wallDocs = await db
        .collection('walls')
        .find()
        .project({ wallId: 1, connectedNodes: 1 })
        .toArray();
    const wallSummary: Record<string, number> = {};
    for (const wall of wallDocs as any[]) {
        wallSummary[String(wall.wallId)] = Number(wall.connectedNodes ?? 0);
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
    const walls = db.collection('walls');
    const docs = await walls.find().sort({ lastSeen: -1 }).toArray();
    return docs.map((doc) =>
        serializeForClient({
            ...doc,
            _id: doc._id.toHexString(),
            connectedNodes: Number(doc.connectedNodes ?? 0)
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
        const project = await db
            .collection('projects')
            .findOne({ _id: new ObjectId(boundProjectId) }, { projection: { name: 1 } });
        projectName = project?.name ? String(project.name) : null;
    } catch {
        // Keep null fallback when IDs are malformed or project does not exist.
    }

    if (boundCommitId && boundSlideId) {
        try {
            const commit = await db
                .collection('commits')
                .findOne(
                    { _id: new ObjectId(boundCommitId) },
                    { projection: { 'content.slides.id': 1, 'content.slides.name': 1 } }
                );
            const slides = (commit?.content?.slides as Array<{ id?: string; name?: string }>) ?? [];
            const slide = slides.find((s) => s.id === boundSlideId);
            slideName = slide?.name ? String(slide.name) : null;
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

    await db.collection('walls').updateOne(
        { wallId },
        {
            $set: {
                boundProjectId: null,
                boundCommitId: null,
                boundSlideId: null,
                updatedAt: new Date().toISOString()
            }
        }
    );
}

export async function adminListPublicAssets() {
    const docs = await db
        .collection('assets')
        .find({ public: true })
        .sort({ createdAt: -1 })
        .toArray();
    return docs.map(serializeAsset);
}

export async function adminDeletePublicAsset(assetId: string) {
    const assets = db.collection('assets');
    const asset = await assets.findOne({ _id: new ObjectId(assetId), public: true });
    if (!asset) throw new Error('Public asset not found');

    await assets.deleteOne({ _id: new ObjectId(assetId) });

    if (asset.url && typeof asset.url === 'string') {
        const { unlink } = await import('node:fs/promises');
        const { join } = await import('node:path');
        const baseId = asset.url.replace(/\.[^.]+$/, '');
        const filesToDelete = [asset.url];
        if (asset.previewUrl) filesToDelete.push(asset.previewUrl as string);
        if (Array.isArray(asset.sizes)) {
            for (const size of asset.sizes) filesToDelete.push(`${baseId}_${size}.webp`);
        }
        await Promise.allSettled(filesToDelete.map((f) => unlink(join(ASSET_DIR, f))));
    }
}
