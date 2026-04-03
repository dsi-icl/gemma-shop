import type { WallDocument } from '@repo/db/documents';
import type { Wall } from '@repo/db/schema';

import { serializeForClient } from '~/server/serialization';

export function serializeWall(doc: WallDocument): Wall {
    return serializeForClient({ ...doc, _id: doc._id.toHexString() } as Wall);
}
