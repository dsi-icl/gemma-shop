import type { PublicDoc } from '@repo/db/collections';
import type { AssetDocument } from '@repo/db/documents';
import type { Asset } from '@repo/db/schema';

import { epochToISO, toIdString } from '~/server/serialization';

export function serializeAsset(doc: PublicDoc<AssetDocument>): Asset {
    return {
        id: doc.id,
        projectId: toIdString(doc.projectId),
        name: doc.name,
        url: doc.url,
        size: doc.size,
        mimeType: doc.mimeType ?? null,
        blurhash: doc.blurhash ?? null,
        previewUrl: doc.previewUrl ?? null,
        sizes: doc.sizes ?? null,
        public: doc.public ?? null,
        hidden: doc.hidden,
        deletedAt: doc.deletedAt != null ? epochToISO(doc.deletedAt) : null,
        deletedBy: doc.deletedBy ?? null,
        createdAt: epochToISO(doc.createdAt),
        createdBy: doc.createdBy
    } satisfies Asset;
}
