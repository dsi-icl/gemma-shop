import '@tanstack/react-start/server-only';
import type { Db, Document, FindOptions, ObjectId } from 'mongodb';
import { ObjectId as OID } from 'mongodb';

import type { CommitDocument } from '../documents';
import { type MigrationMap, type PublicDoc, toEpoch, BaseCollection } from './_base';

type CommitInsertData = Omit<CommitDocument, '_id' | 'id' | 'createdAt' | 'updatedAt' | '_version'>;

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
        super(db.collection('commits'));
    }

    protected fromDB(doc: Document): CommitDocument {
        const base = super.fromDB(doc) as unknown as CommitDocument & {
            projectId: unknown;
            parentId: unknown;
            authorId: unknown;
        };
        return {
            ...base,
            projectId: String(base.projectId),
            parentId: base.parentId ? String(base.parentId) : null,
            authorId: String(base.authorId)
        };
    }

    protected toRaw(data: CommitInsertData): Record<string, unknown> {
        return {
            ...data,
            projectId: new OID(data.projectId),
            parentId: data.parentId ? new OID(data.parentId) : null,
            authorId: new OID(data.authorId)
        };
    }

    async findByProject(
        projectId: string | ObjectId,
        options?: FindOptions
    ): Promise<PublicDoc<CommitDocument>[]> {
        return this.find({ projectId: new OID(projectId) }, options);
    }

    async findMutableHead(projectId: string | ObjectId): Promise<PublicDoc<CommitDocument> | null> {
        return this.findOne({ projectId: new OID(projectId), isMutableHead: true });
    }

    /**
     * Replace `content.slides` in place using dot-notation `$set`.
     * This updates ONLY the slides sub-field without touching other `content` keys.
     * `updatedAt` and `_version` are always stamped.
     */
    /** Point a commit's `parentId` to another commit. Used when creating snapshot/HEAD pointers. */
    async setParent(commitId: string, parentId: string): Promise<void> {
        await this.raw.updateOne(
            { _id: new OID(commitId) },
            { $set: { parentId: new OID(parentId), updatedAt: Date.now() } }
        );
    }

    async updateSlides(
        id: string | ObjectId,
        slides: CommitDocument['content']['slides']
    ): Promise<void> {
        await this.raw.updateOne(
            { _id: new OID(id) },
            {
                $set: {
                    'content.slides': slides,
                    updatedAt: Date.now(),
                    _version: this.currentVersion
                }
            }
        );
    }
}
