import '@tanstack/react-start/server-only';
import { getWallNodeCount } from '~/lib/busState';
import { dbCol } from '~/server/collections';
import { serializeWall } from '~/server/serializers/wall.serializer';

export async function listWalls() {
    const walls = await dbCol.walls.find({}, { sort: { lastSeen: -1 } });
    return walls.map((wallDoc) => {
        const wall = serializeWall(wallDoc);
        // Prefer persisted DB counter so this works across workers/processes.
        // Keep an in-process fallback for local/dev consistency.
        wall.connectedNodes = Number(getWallNodeCount(wall.wallId) ?? 0);
        return wall;
    });
}
