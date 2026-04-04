import '@tanstack/react-start/server-only';
import type { Db, ObjectId } from 'mongodb';

import type { AssetDocument } from '../documents';
import { BaseCollection } from './_base';

export class AssetsCollection extends BaseCollection<AssetDocument> {
    readonly collectionName = 'assets';
    protected readonly epochFields = ['deletedAt', 'updatedAt'] as const;

    constructor(db: Db) {
        super(db.collection(AssetsCollection.prototype.collectionName));
    }

    async findByProject(
        projectId: string | ObjectId,
        includeDeleted = false
    ): Promise<AssetDocument[]> {
        const { ObjectId: OID } = await import('mongodb');
        const filter: Record<string, unknown> = { projectId: new OID(projectId) };
        if (!includeDeleted) filter.deletedAt = { $exists: false };
        return this.find(filter);
    }

    async findPublic(includeDeleted = false): Promise<AssetDocument[]> {
        const filter: Record<string, unknown> = { public: true, hidden: { $ne: true } };
        if (!includeDeleted) filter.deletedAt = { $exists: false };
        return this.find(filter);
    }
}
