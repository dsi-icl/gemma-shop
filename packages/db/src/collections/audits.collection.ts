import '@tanstack/react-start/server-only';
import type { Db, Document, FindOptions, ObjectId } from 'mongodb';

import type { AuditLogDocument } from '../documents';
import { type MigrationMap, type PublicDoc, toEpoch, BaseCollection } from './_base';

export class AuditsCollection extends BaseCollection<AuditLogDocument> {
    readonly collectionName = 'audits';
    readonly currentVersion = 1;

    protected readonly migrations: MigrationMap = {
        0: (doc) => ({
            ...doc,
            createdAt: toEpoch(doc.createdAt ?? Date.now())
        })
    };

    constructor(db: Db) {
        super(db.collection('audits'));
    }

    protected fromDB(doc: Document): AuditLogDocument {
        const base = super.fromDB(doc) as unknown as AuditLogDocument & { projectId: unknown };
        return {
            ...base,
            projectId: base.projectId ? String(base.projectId) : null
        };
    }

    async findByProject(
        projectId: string | ObjectId,
        options?: FindOptions
    ): Promise<PublicDoc<AuditLogDocument>[]> {
        const { ObjectId: OID } = await import('mongodb');
        return this.find({ projectId: new OID(projectId) }, options);
    }

    /**
     * Audit logs are append-only — no updates or soft-deletes.
     * Override insert to skip the `updatedAt` stamp that the base would add.
     */
    async insertLog(
        data: Omit<AuditLogDocument, '_id' | 'id' | 'createdAt' | '_version'>
    ): Promise<PublicDoc<AuditLogDocument>> {
        const { ObjectId: OID } = await import('mongodb');
        const doc = {
            _id: new OID(),
            createdAt: Date.now(),
            _version: this.currentVersion,
            ...data,
            projectId: data.projectId ? new OID(data.projectId) : null
        };
        await this.raw.insertOne(doc);
        return this.expose(this.fromDB(doc));
    }
}
