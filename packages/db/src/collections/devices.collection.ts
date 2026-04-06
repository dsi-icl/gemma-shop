import '@tanstack/react-start/server-only';
import type { Db } from 'mongodb';
import { ObjectId as OID } from 'mongodb';

import type { DeviceDocument } from '../documents';
import { type MigrationMap, type PublicDoc, toEpoch, BaseCollection } from './_base';

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
        super(db.collection('devices'));
    }

    async findByWall(wallId: string): Promise<PublicDoc<DeviceDocument>[]> {
        return this.find({ assignedWallId: wallId });
    }

    async touchLastSeen(deviceId: string): Promise<void> {
        const now = Date.now();
        await this.raw.updateOne(
            { deviceId },
            { $set: { lastSeenAt: now, updatedAt: now, _version: this.currentVersion } }
        );
    }

    /**
     * Aggregate active device counts grouped by wallId.
     * Used for admin wall listing to show how many devices are enrolled per wall.
     */
    async aggregateCountByWall(): Promise<{ wallId: string; total: number }[]> {
        const rows = await this.raw
            .aggregate<{ _id: string; total: number }>([
                {
                    $match: {
                        kind: 'wall',
                        assignedWallId: { $type: 'string', $ne: null },
                        status: { $ne: 'revoked' }
                    }
                },
                { $group: { _id: '$assignedWallId', total: { $sum: 1 } } }
            ])
            .toArray();
        return rows.map((r) => ({ wallId: r._id, total: r.total }));
    }

    /**
     * Fetch the wall assignment for a set of connected device IDs.
     * Used to correlate live WebSocket sessions with their assigned wall.
     */
    async findWallDevicesByIds(
        deviceIds: string[]
    ): Promise<{ deviceId?: string; assignedWallId?: string | null }[]> {
        if (deviceIds.length === 0) return [];
        return this.raw
            .find<{ deviceId?: string; assignedWallId?: string | null }>(
                {
                    deviceId: { $in: deviceIds },
                    kind: 'wall',
                    assignedWallId: { $type: 'string', $ne: null },
                    status: { $ne: 'revoked' }
                },
                { projection: { deviceId: 1, assignedWallId: 1 } }
            )
            .toArray();
    }

    /**
     * Detach all devices from a wall when the wall is deleted.
     * Sets `assignedWallId` to null and `status` to `'pending'`.
     */
    async detachFromWall(wallId: string): Promise<void> {
        await this.raw.updateMany(
            { assignedWallId: wallId },
            {
                $set: {
                    assignedWallId: null,
                    status: 'pending',
                    updatedAt: Date.now(),
                    _version: this.currentVersion
                }
            }
        );
    }

    /**
     * Enroll a device: atomically assigns it to a wall, stamping `assignedAt`, `assignedBy`,
     * and setting status to `'active'`. Guards against concurrent enrollment via extra filter.
     */
    async enroll(
        id: string | OID,
        data: { assignedWallId: string; assignedBy: string; assignedAt: number }
    ): Promise<PublicDoc<DeviceDocument> | null> {
        const result = await this.raw.findOneAndUpdate(
            { _id: new OID(id), status: { $ne: 'revoked' }, assignedWallId: null },
            {
                $set: {
                    ...data,
                    status: 'active',
                    updatedAt: Date.now(),
                    _version: this.currentVersion
                }
            },
            { returnDocument: 'after' }
        );
        return result ? this.expose(this.fromDB(result)) : null;
    }
}
