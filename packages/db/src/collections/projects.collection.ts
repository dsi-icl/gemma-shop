import '@tanstack/react-start/server-only';
import type { Db, ObjectId } from 'mongodb';

import type { ProjectDocument } from '../documents';
import { type MigrationMap, toEpoch, BaseCollection } from './_base';

export class ProjectsCollection extends BaseCollection<ProjectDocument> {
    readonly collectionName = 'projects';
    readonly currentVersion = 1;

    protected readonly migrations: MigrationMap = {
        0: (doc) => ({
            ...doc,
            createdAt: toEpoch(doc.createdAt ?? Date.now()),
            updatedAt: toEpoch(doc.updatedAt ?? Date.now()),
            ...(doc.deletedAt != null ? { deletedAt: toEpoch(doc.deletedAt) } : {})
        })
    };

    constructor(db: Db) {
        super(db.collection(ProjectsCollection.prototype.collectionName));
    }

    async findByUser(userEmail: string, includeArchived = false): Promise<ProjectDocument[]> {
        const filter: Record<string, unknown> = {
            $or: [{ createdBy: userEmail }, { 'collaborators.email': userEmail }]
        };
        if (!includeArchived) filter.deletedAt = { $exists: false };
        return this.find(filter);
    }

    async findPublished(): Promise<ProjectDocument[]> {
        return this.find({
            deletedAt: { $exists: false },
            visibility: 'public',
            publishedCommitId: { $ne: null }
        });
    }

    async updateHead(
        id: string | ObjectId,
        headCommitId: ObjectId
    ): Promise<ProjectDocument | null> {
        return this.update(id, { headCommitId } as Partial<ProjectDocument>);
    }

    async updatePublishedCommit(
        id: string | ObjectId,
        publishedCommitId: ObjectId | null,
        visibility: 'public' | 'private'
    ): Promise<ProjectDocument | null> {
        return this.update(id, { publishedCommitId, visibility } as Partial<ProjectDocument>);
    }
}
