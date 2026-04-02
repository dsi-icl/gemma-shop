import '@tanstack/react-start/server-only';
import { getWallNodeCount } from '~/lib/busState';
import { collections } from '~/server/collections';
import { serializeWall } from '~/server/serializers/wall.serializer';

const walls = collections.walls;

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
