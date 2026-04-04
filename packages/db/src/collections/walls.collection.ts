import '@tanstack/react-start/server-only';
import type { Db } from 'mongodb';

import type { WallDocument } from '../documents';
import { BaseCollection } from './_base';

export class WallsCollection extends BaseCollection<WallDocument> {
    readonly collectionName = 'walls';
    protected readonly epochFields = ['lastSeen'] as const;

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
