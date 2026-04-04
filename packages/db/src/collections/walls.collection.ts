import '@tanstack/react-start/server-only';
import type { Db } from 'mongodb';

import type { WallDocument } from '../documents';
import { type MigrationMap, toEpoch, BaseCollection } from './_base';

export class WallsCollection extends BaseCollection<WallDocument> {
    readonly collectionName = 'walls';
    readonly currentVersion = 1;

    protected readonly migrations: MigrationMap = {
        0: (doc) => ({
            ...doc,
            createdAt: toEpoch(doc.createdAt ?? Date.now()),
            lastSeen: toEpoch(doc.lastSeen ?? Date.now()),
            ...(doc.updatedAt != null ? { updatedAt: toEpoch(doc.updatedAt) } : {})
        })
    };

    constructor(db: Db) {
        super(db.collection('walls'));
    }

    async findByWallId(wallId: string): Promise<WallDocument | null> {
        return this.findOne({ wallId });
    }

    /** Returns all wallId strings — used for lightweight stats lookups. */
    async listWallIds(): Promise<string[]> {
        const docs = await this.raw.find({}).project({ wallId: 1 }).toArray();
        return docs.map((d) => d.wallId).filter((id): id is string => typeof id === 'string');
    }

    async touchLastSeen(wallId: string): Promise<void> {
        const now = Date.now();
        await this.raw.updateOne(
            { wallId },
            { $set: { lastSeen: now, updatedAt: now, _version: this.currentVersion } }
        );
    }

    /**
     * Update fields on a wall identified by its `wallId` string (not `_id`).
     * Stamps `updatedAt` and `_version` automatically.
     * Use for hot-path updates (bind/unbind) where only `wallId` is available.
     */
    async updateByWallId(
        wallId: string,
        fields: Partial<Omit<WallDocument, '_id' | 'createdAt' | '_version'>>
    ): Promise<void> {
        await this.raw.updateOne(
            { wallId },
            {
                $set: { ...fields, updatedAt: Date.now(), _version: this.currentVersion }
            }
        );
    }
}
