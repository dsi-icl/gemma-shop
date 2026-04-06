import type { PublicDoc } from '@repo/db/collections';
import type { WallDocument } from '@repo/db/documents';
import type { Wall } from '@repo/db/schema';

import { epochToISO } from '~/server/serialization';

export function serializeWall(doc: PublicDoc<WallDocument>): Wall {
    return {
        id: doc.id,
        wallId: doc.wallId,
        name: doc.name,
        connectedNodes: doc.connectedNodes ?? 0,
        lastSeen: epochToISO(doc.lastSeen),
        boundProjectId: doc.boundProjectId ?? null,
        boundSlideId: doc.boundSlideId ?? null,
        createdAt: epochToISO(doc.createdAt)
    } satisfies Wall;
}
