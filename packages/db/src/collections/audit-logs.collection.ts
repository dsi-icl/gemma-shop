import '@tanstack/react-start/server-only';
import type { Db, FindOptions, ObjectId } from 'mongodb';

import type { AuditLogDocument } from '../documents';
import { type MigrationMap, toEpoch, BaseCollection } from './_base';

export class AuditLogsCollection extends BaseCollection<AuditLogDocument> {
    readonly collectionName = 'audit_logs';
    readonly currentVersion = 1;

    protected readonly migrations: MigrationMap = {
        0: (doc) => ({
            ...doc,
            createdAt: toEpoch(doc.createdAt ?? Date.now())
        })
    };

    constructor(db: Db) {
        super(db.collection('audit_logs'));
    }

    async findByProject(
        projectId: string | ObjectId,
        options?: FindOptions
    ): Promise<AuditLogDocument[]> {
        const { ObjectId: OID } = await import('mongodb');
        return this.find({ projectId: new OID(projectId) }, options);
    }

    /**
     * Audit logs are append-only — no updates or soft-deletes.
     * Override insert to skip the `updatedAt` stamp that the base would add.
     */
    async insertLog(
        data: Omit<AuditLogDocument, '_id' | 'id' | 'createdAt' | '_version'>
    ): Promise<AuditLogDocument> {
        const { ObjectId: OID } = await import('mongodb');
        const doc = {
            _id: new OID(),
            createdAt: Date.now(),
            _version: this.currentVersion,
            ...data
        };
        await this.raw.insertOne(doc);
        return this.fromDB(doc);
    }
}
