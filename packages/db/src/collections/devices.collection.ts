import '@tanstack/react-start/server-only';
import type { Db } from 'mongodb';

import type { DeviceDocument } from '../documents';
import { BaseCollection } from './_base';

export class DevicesCollection extends BaseCollection<DeviceDocument> {
    readonly collectionName = 'devices';
    protected readonly epochFields = ['assignedAt', 'lastSeenAt'] as const;

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
