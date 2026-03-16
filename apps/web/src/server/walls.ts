import '@tanstack/react-start/server-only';
import { db } from '@repo/db';
import type { Wall } from '@repo/db/schema';

import {
    bindWall,
    getOrCreateScope,
    getWallNodeCount,
    hydrateWallNodes,
    internScope,
    notifyControllers,
    seedScopeFromDb
} from '~/lib/busState';

const walls = db.collection('walls');

function serializeWall(doc: any): Wall {
    return { ...doc, _id: doc._id.toHexString() };
}

export async function listWalls() {
    const docs = await walls.find().sort({ lastSeen: -1 }).toArray();
    return docs.map((doc) => {
        const wall = serializeWall(doc);
        // Override stale MongoDB counter with live in-memory count
        wall.connectedNodes = getWallNodeCount(wall.wallId);
        return wall;
    });
}

export async function bindWallToScope(
    wallId: string,
    projectId: string,
    commitId: string,
    slideId: string
) {
    const scopeId = internScope(projectId, commitId, slideId);
    const scope = getOrCreateScope(scopeId, projectId, commitId, slideId);
    bindWall(wallId, scopeId);

    // Auto-seed from DB if scope is fresh, then hydrate walls
    if (scope.layers.size === 0) {
        await seedScopeFromDb(scopeId);
    }
    hydrateWallNodes(wallId);
    notifyControllers(wallId, true, projectId, commitId, slideId);

    // Persist binding in DB
    await walls.updateOne(
        { wallId },
        { $set: { boundProjectId: projectId, boundCommitId: commitId, boundSlideId: slideId } }
    );
}
