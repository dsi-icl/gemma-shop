import '@tanstack/react-start/server-only';
import type { Db } from 'mongodb';
import { ObjectId as OID } from 'mongodb';
import type { Document } from 'mongodb';

import type { ProjectDocument } from '../documents';
import { type MigrationMap, type PublicDoc, toEpoch, BaseCollection } from './_base';

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
        super(db.collection('projects'));
    }

    protected fromDB(doc: Document): ProjectDocument {
        const base = super.fromDB(doc) as unknown as ProjectDocument & {
            headCommitId: unknown;
            publishedCommitId: unknown;
        };
        return {
            ...base,
            headCommitId: base.headCommitId ? String(base.headCommitId) : null,
            publishedCommitId: base.publishedCommitId ? String(base.publishedCommitId) : null
        };
    }

    async findByUser(
        userEmail: string,
        includeArchived = false
    ): Promise<PublicDoc<ProjectDocument>[]> {
        const filter: Record<string, unknown> = {
            $or: [{ createdBy: userEmail }, { 'collaborators.email': userEmail }]
        };
        if (!includeArchived) filter.deletedAt = { $exists: false };
        return this.find(filter);
    }

    async findPublished(): Promise<PublicDoc<ProjectDocument>[]> {
        return this.find({
            deletedAt: { $exists: false },
            visibility: 'public',
            publishedCommitId: { $ne: null }
        });
    }

    /**
     * Fetch only the `tags` field for all projects visible to a user.
     * Used to compute the full tag vocabulary without loading whole project documents.
     */
    async findTagsByUser(userEmail: string): Promise<(string[] | null | undefined)[]> {
        const docs = await this.raw
            .find<{ tags?: string[] | null }>(
                { $or: [{ createdBy: userEmail }, { 'collaborators.email': userEmail }] },
                { projection: { tags: 1 } }
            )
            .toArray();
        return docs.map((d) => d.tags);
    }

    /**
     * Fetch `_id` and `publishedCommitId` for all published projects.
     * Projection-only query — used by the gallery handler to build the published-projects snapshot.
     */
    async findPublishedCommitRefs(): Promise<
        { projectId: string; publishedCommitId: string | null }[]
    > {
        const docs = await this.raw
            .find<{ _id: unknown; publishedCommitId?: unknown }>(
                { publishedCommitId: { $ne: null }, deletedAt: { $exists: false } },
                { projection: { _id: 1, publishedCommitId: 1 } }
            )
            .toArray();
        return docs.map((doc) => ({
            projectId: String(doc._id),
            publishedCommitId: doc.publishedCommitId ? String(doc.publishedCommitId) : null
        }));
    }

    /** Set the project's mutable HEAD pointer. Accepts a string commit ID. */
    async setHeadCommit(projectId: string, commitId: string): Promise<void> {
        await this.raw.updateOne(
            { _id: new OID(projectId) },
            { $set: { headCommitId: new OID(commitId), updatedAt: Date.now() } }
        );
    }

    /** Set (or clear) the project's published commit pointer. Accepts a string commit ID or null. */
    async setPublishedCommit(
        projectId: string,
        commitId: string | null,
        visibility: 'public' | 'private'
    ): Promise<void> {
        await this.raw.updateOne(
            { _id: new OID(projectId) },
            {
                $set: {
                    publishedCommitId: commitId ? new OID(commitId) : null,
                    visibility,
                    updatedAt: Date.now()
                }
            }
        );
    }
}
