import '@tanstack/react-start/server-only';
import { getWallNodeCount } from '~/lib/busState';
import { collections } from '~/server/collections';
import { serializeWall } from '~/server/serializers/wall.serializer';

export async function listWalls() {
    const docs = await collections.walls.find().sort({ lastSeen: -1 }).toArray();
    return docs.map((doc) => {
        const wall = serializeWall(doc);
        // Prefer persisted DB counter so this works across workers/processes.
        // Keep an in-process fallback for local/dev consistency.
        wall.connectedNodes = Number(getWallNodeCount(wall.wallId) ?? 0);
        return wall;
    });
}
