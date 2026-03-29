import '@tanstack/react-start/server-only';
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
import { logAuditSuccess } from '~/server/audit';
import { collections } from '~/server/collections';
import { serializeWall } from '~/server/serializers/wall.serializer';

const walls = collections.walls;
const commits = collections.commits;
const projects = collections.projects;

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
            }
        },
        { upsert: true }
    );
    await logAuditSuccess({
        action: 'WALL_BOUND',
        resourceType: 'wall',
        resourceId: wallId,
        projectId,
        changes: {
            projectId,
            commitId,
            slideId: resolvedSlideId,
            source: 'gallery'
        }
    });

    process.__BROADCAST_WALL_BINDING_CHANGED__?.(wallId);
}
