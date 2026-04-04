import '@tanstack/react-start/server-only';
import type { Db, ObjectId } from 'mongodb';

import type { CommitDocument } from '../documents';
import { type MigrationMap, toEpoch, BaseCollection } from './_base';

export class CommitsCollection extends BaseCollection<CommitDocument> {
    readonly collectionName = 'commits';
    readonly currentVersion = 1;

    protected readonly migrations: MigrationMap = {
        0: (doc) => ({
            ...doc,
            createdAt: toEpoch(doc.createdAt ?? Date.now()),
            ...(doc.updatedAt != null ? { updatedAt: toEpoch(doc.updatedAt) } : {})
        })
    };

    constructor(db: Db) {
        super(db.collection(CommitsCollection.prototype.collectionName));
    }

    async findByProject(projectId: string | ObjectId): Promise<CommitDocument[]> {
        const { ObjectId: OID } = await import('mongodb');
        return this.find({ projectId: new OID(projectId) });
    }

    async findMutableHead(projectId: string | ObjectId): Promise<CommitDocument | null> {
        const { ObjectId: OID } = await import('mongodb');
        return this.findOne({ projectId: new OID(projectId), isMutableHead: true });
    }
}
