import type { WallDocument } from '@repo/db/documents';
import type { Wall } from '@repo/db/schema';

import { epochToISO, serializeForClient } from '~/server/serialization';

export function serializeWall(doc: WallDocument): Wall {
    return serializeForClient({
        ...doc,
        _id: doc._id.toHexString(),
        createdAt: epochToISO(doc.createdAt),
        lastSeen: epochToISO(doc.lastSeen)
    } as Wall);
}
