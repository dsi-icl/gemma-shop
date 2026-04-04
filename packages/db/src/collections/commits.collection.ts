import '@tanstack/react-start/server-only';
import type { Db, ObjectId } from 'mongodb';

import type { CommitDocument } from '../documents';
import { BaseCollection } from './_base';

export class CommitsCollection extends BaseCollection<CommitDocument> {
    readonly collectionName = 'commits';
    protected readonly epochFields = [] as const;

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
