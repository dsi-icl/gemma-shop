import '@tanstack/react-start/server-only';
import { db } from '@repo/db';
import type { Wall } from '@repo/db/schema';

import {
    bindWall as bindWallState,
    getOrCreateScope,
    hydrateWallNodes,
    notifyControllers
} from '~/lib/busState';
import { makeScopeKey } from '~/lib/types';

const walls = db.collection('walls');

function serializeWall(doc: any): Wall {
    return { ...doc, _id: doc._id.toHexString() };
}

export async function listWalls() {
    const docs = await walls.find().sort({ lastSeen: -1 }).toArray();
    return docs.map(serializeWall);
}

export async function upsertWallConnection(wallId: string) {
    await walls.updateOne(
        { wallId },
        {
            $inc: { connectedNodes: 1 },
            $set: { lastSeen: new Date().toISOString() },
            $setOnInsert: {
                wallId,
                name: wallId,
                createdAt: new Date().toISOString()
            }
        },
        { upsert: true }
    );
}

export async function decrementWallConnection(wallId: string) {
    await walls.updateOne(
        { wallId, connectedNodes: { $gt: 0 } },
        {
            $inc: { connectedNodes: -1 },
            $set: { lastSeen: new Date().toISOString() }
        }
    );
}

export async function bindWallToScope(wallId: string, projectId: string, slideId: string) {
    const scopeKey = makeScopeKey(projectId, slideId);
    getOrCreateScope(scopeKey, projectId, slideId);
    bindWallState(wallId, scopeKey);
    hydrateWallNodes(wallId);
    notifyControllers(wallId, true, projectId, slideId);

    // Persist binding in DB
    await walls.updateOne(
        { wallId },
        { $set: { boundProjectId: projectId, boundSlideId: slideId } }
    );
}
