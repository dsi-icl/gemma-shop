import type { AssetDocument } from '@repo/db/documents';
import type { Asset } from '@repo/db/schema';

import { epochToISO, serializeForClient, toIdString } from '~/server/serialization';

export function serializeAsset(doc: AssetDocument): Asset {
    return serializeForClient({
        ...doc,
        _id: toIdString(doc._id),
        projectId: toIdString(doc.projectId),
        createdAt: epochToISO(doc.createdAt),
        deletedAt: doc.deletedAt != null ? epochToISO(doc.deletedAt) : null
    } as Asset);
}
