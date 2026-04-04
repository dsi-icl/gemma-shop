import '@tanstack/react-start/server-only';
import type { Binary, Db } from 'mongodb';
import { ObjectId as OID } from 'mongodb';

import type { YDocDocument } from '../documents';
import { type MigrationMap, toEpoch, BaseCollection } from './_base';

export class YDocsCollection extends BaseCollection<YDocDocument> {
    readonly collectionName = 'ydocs';
    readonly currentVersion = 1;

    protected readonly migrations: MigrationMap = {
        0: (doc) => ({
            ...doc,
            createdAt: toEpoch(doc.createdAt ?? Date.now()),
            updatedAt: toEpoch(doc.updatedAt ?? Date.now())
        })
    };

    constructor(db: Db) {
        super(db.collection('ydocs'));
    }

    /** Ensure the unique index on `scope`. Call once at startup. */
    async ensureScopeIndex(): Promise<void> {
        await this.raw.createIndex({ scope: 1 }, { unique: true, name: 'scope_unique' });
    }

    async findByScope(scope: string): Promise<YDocDocument | null> {
        return this.findOne({ scope });
    }

    /**
     * Fetch only the `data` binary for a given scope.
     * Uses a projection to avoid transferring the rest of the document.
     */
    async findDataByScope(scope: string): Promise<Binary | null> {
        const doc = await this.raw.findOne({ scope }, { projection: { data: 1 } });
        return doc ? (doc.data as Binary) : null;
    }

    /**
     * Upsert a ydoc by scope. Stamps `_version` on both insert and update paths.
     * Uses `$setOnInsert` to avoid overwriting `createdAt` on updates.
     */
    async upsertByScope(scope: string, data: Binary): Promise<void> {
        const now = Date.now();
        await this.raw.updateOne(
            { scope },
            {
                $set: { scope, data, updatedAt: now, _version: this.currentVersion },
                $setOnInsert: { _id: new OID(), createdAt: now }
            },
            { upsert: true }
        );
    }

    /** Delete a ydoc by scope string (used when the associated layer is removed). */
    async deleteByScope(scope: string): Promise<void> {
        await this.raw.deleteOne({ scope });
    }
}
