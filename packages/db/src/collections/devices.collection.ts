import '@tanstack/react-start/server-only';
import type { Db } from 'mongodb';

import type { DeviceDocument } from '../documents';
import { type MigrationMap, toEpoch, BaseCollection } from './_base';

export class DevicesCollection extends BaseCollection<DeviceDocument> {
    readonly collectionName = 'devices';
    readonly currentVersion = 1;

    protected readonly migrations: MigrationMap = {
        0: (doc) => ({
            ...doc,
            createdAt: toEpoch(doc.createdAt ?? Date.now()),
            updatedAt: toEpoch(doc.updatedAt ?? Date.now()),
            ...(doc.assignedAt != null ? { assignedAt: toEpoch(doc.assignedAt) } : {}),
            ...(doc.lastSeenAt != null ? { lastSeenAt: toEpoch(doc.lastSeenAt) } : {})
        })
    };

    constructor(db: Db) {
        super(db.collection(DevicesCollection.prototype.collectionName));
    }

    async findByWall(wallId: string): Promise<DeviceDocument[]> {
        return this.find({ assignedWallId: wallId });
    }

    async touchLastSeen(deviceId: string): Promise<void> {
        const now = Date.now();
        await this.raw.updateOne({ deviceId }, { $set: { lastSeenAt: now, updatedAt: now } });
    }
}
