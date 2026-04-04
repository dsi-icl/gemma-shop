import '@tanstack/react-start/server-only';
import type { Db, FindOptions, ObjectId } from 'mongodb';
import { ObjectId as OID } from 'mongodb';

import type { AssetDocument } from '../documents';
import { type MigrationMap, toEpoch, BaseCollection } from './_base';

export class AssetsCollection extends BaseCollection<AssetDocument> {
    readonly collectionName = 'assets';
    readonly currentVersion = 1;

    protected readonly migrations: MigrationMap = {
        0: (doc) => ({
            ...doc,
            createdAt: toEpoch(doc.createdAt ?? Date.now()),
            ...(doc.updatedAt != null ? { updatedAt: toEpoch(doc.updatedAt) } : {}),
            ...(doc.deletedAt != null ? { deletedAt: toEpoch(doc.deletedAt) } : {})
        })
    };

    constructor(db: Db) {
        super(db.collection('assets'));
    }

    async findByProject(
        projectId: string | ObjectId,
        includeDeleted = false,
        options?: FindOptions
    ): Promise<AssetDocument[]> {
        const filter: Record<string, unknown> = {
            projectId: new OID(projectId),
            hidden: { $ne: true }
        };
        if (!includeDeleted) filter.deletedAt = { $exists: false };
        return this.find(filter, options);
    }

    async findPublic(includeDeleted = false, options?: FindOptions): Promise<AssetDocument[]> {
        const filter: Record<string, unknown> = { public: true, hidden: { $ne: true } };
        if (!includeDeleted) filter.deletedAt = { $exists: false };
        return this.find(filter, options);
    }

    /**
     * Fetch blurhash and sizes metadata for a list of asset URLs.
     * Projection-only query — avoids loading full asset documents for hero image display.
     */
    async findBlurhashMetaByUrls(
        urls: string[]
    ): Promise<{ url: string; blurhash?: string | null; sizes?: number[] | null }[]> {
        if (urls.length === 0) return [];
        return this.raw
            .find<{ url: string; blurhash?: string | null; sizes?: number[] | null }>(
                { url: { $in: urls }, deletedAt: { $exists: false } },
                { projection: { url: 1, blurhash: 1, sizes: 1 } }
            )
            .toArray();
    }

    /**
     * Hard-delete an asset record by URL.
     * @deprecated Only for web-screenshot cleanup where a hidden placeholder record
     * must be fully removed. All other asset deletions must use `softDelete()`.
     */
    async hardDeleteByUrl(url: string): Promise<void> {
        await this.raw.deleteOne({ url });
    }
}
