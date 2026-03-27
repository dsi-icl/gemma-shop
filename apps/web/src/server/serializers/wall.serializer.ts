import type { Wall } from '@repo/db/schema';

import { serializeForClient } from '~/server/serialization';

export function serializeWall(
    doc: { _id: { toHexString: () => string } } & Record<string, unknown>
): Wall {
    return serializeForClient({ ...doc, _id: doc._id.toHexString() } as Wall);
}
