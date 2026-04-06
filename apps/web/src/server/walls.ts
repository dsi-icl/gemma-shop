import '@tanstack/react-start/server-only';
import { getWallNodeCount } from '~/lib/busState';
import { dbCol } from '~/server/collections';

export async function listWalls() {
    const walls = await dbCol.walls.find({}, { sort: { lastSeen: -1 } });
    return walls.map((wall) => ({
        ...wall,
        connectedNodes: Number(getWallNodeCount(wall.wallId) ?? 0)
    }));
}
