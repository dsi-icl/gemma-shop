import '@tanstack/react-start/server-only';
import { db } from '@repo/db';
import type { Wall } from '@repo/db/schema';
import { ObjectId } from 'mongodb';

import {
    bindWall,
    broadcastToControllersByWallRaw,
    getOrCreateScope,
    getWallHydratePayload,
    getWallNodeCount,
    hydrateWallNodes,
    internScope,
    notifyControllers,
    seedScopeFromDb
} from '~/lib/busState';
import { schemaVersionOnInsert } from '~/server/schemaVersions';

const walls = db.collection('walls');
const commits = db.collection('commits');
const projects = db.collection('projects');

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

function serializeWall(doc: any): Wall {
    return serializeForClient({ ...doc, _id: doc._id.toHexString() });
}

export async function listWalls() {
    const docs = await walls.find().sort({ lastSeen: -1 }).toArray();
    return docs.map((doc) => {
        const wall = serializeWall(doc);
        // Prefer persisted DB counter so this works across workers/processes.
        // Keep an in-process fallback for local/dev consistency.
        wall.connectedNodes = Number(doc.connectedNodes ?? getWallNodeCount(wall.wallId) ?? 0);
        return wall;
    });
}

export async function bindWallToScope(
    wallId: string,
    projectId: string,
    commitId: string,
    slideId: string
) {
    const [commit, project] = await Promise.all([
        commits.findOne(
            { _id: new ObjectId(commitId), projectId: new ObjectId(projectId) },
            { projection: { 'content.slides.id': 1 } }
        ),
        projects.findOne(
            { _id: new ObjectId(projectId) },
            { projection: { customRenderUrl: 1, customRenderCompat: 1, customRenderProxy: 1 } }
        )
    ]);
    if (!commit) throw new Error('Commit not found for project');

    const slides = (commit.content?.slides as Array<{ id?: string }>) ?? [];
    const requestedExists = slides.some((s) => s.id === slideId);
    const resolvedSlideId = requestedExists ? slideId : (slides[0]?.id ?? null);
    if (!resolvedSlideId) throw new Error('Commit has no slides to bind');

    const scopeId = internScope(projectId, commitId, resolvedSlideId);
    const scope = getOrCreateScope(
        scopeId,
        projectId,
        commitId,
        resolvedSlideId,
        project?.customRenderUrl,
        project?.customRenderCompat,
        project?.customRenderProxy
    );
    bindWall(wallId, scopeId, 'gallery');

    // Auto-seed from DB if scope is fresh, then hydrate walls
    if (scope.layers.size === 0) {
        await seedScopeFromDb(scopeId);
    }
    hydrateWallNodes(wallId);
    broadcastToControllersByWallRaw(wallId, getWallHydratePayload(scopeId, wallId));
    notifyControllers(wallId, true, projectId, commitId, resolvedSlideId, scope.customRenderUrl);

    // Persist binding in DB
    await walls.updateOne(
        { wallId },
        {
            $set: {
                boundProjectId: projectId,
                boundCommitId: commitId,
                boundSlideId: resolvedSlideId,
                boundSource: 'gallery',
                updatedAt: new Date().toISOString()
            },
            $setOnInsert: schemaVersionOnInsert('walls')
        },
        { upsert: true }
    );

    process.__BROADCAST_WALL_BINDING_CHANGED__?.(wallId);
}
