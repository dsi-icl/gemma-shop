import '@tanstack/react-start/server-only';
import type { Db, ObjectId } from 'mongodb';

import type { AuditLogDocument } from '../documents';
import { BaseCollection } from './_base';

export class AuditLogsCollection extends BaseCollection<AuditLogDocument> {
    readonly collectionName = 'audit_logs';
    protected readonly epochFields = [] as const;

    constructor(db: Db) {
        super(db.collection(AuditLogsCollection.prototype.collectionName));
    }

    async findByProject(projectId: string | ObjectId): Promise<AuditLogDocument[]> {
        const { ObjectId: OID } = await import('mongodb');
        return this.find({ projectId: new OID(projectId) });
    }

    /**
     * Audit logs are append-only — no updates or soft-deletes.
     * Override insert to skip the `updatedAt` stamp that the base would add.
     */
    async insertLog(data: Omit<AuditLogDocument, '_id' | 'createdAt'>): Promise<AuditLogDocument> {
        const { ObjectId: OID } = await import('mongodb');
        const now = Date.now();
        const doc = { _id: new OID(), createdAt: now, ...data };
        await this.raw.insertOne(doc);
        return this.fromDB(doc);
    }
}
