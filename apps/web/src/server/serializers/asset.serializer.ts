import type { Asset } from '@repo/db/schema';

import { serializeForClient, toIdString } from '~/server/serialization';

export function serializeAsset(doc: Record<string, unknown>): Asset {
    return serializeForClient({
        ...doc,
        _id: toIdString(doc._id),
        projectId: toIdString(doc.projectId)
    } as Asset);
}
