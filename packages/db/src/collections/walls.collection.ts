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
        super(db.collection(WallsCollection.prototype.collectionName));
    }

    async findByWallId(wallId: string): Promise<WallDocument | null> {
        return this.findOne({ wallId });
    }

    async touchLastSeen(wallId: string): Promise<void> {
        const now = Date.now();
        await this.raw.updateOne({ wallId }, { $set: { lastSeen: now, updatedAt: now } });
    }
}
