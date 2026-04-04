import '@tanstack/react-start/server-only';
import type { Db } from 'mongodb';

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
        super(db.collection(YDocsCollection.prototype.collectionName));
    }

    async findByScope(scope: string): Promise<YDocDocument | null> {
        return this.findOne({ scope });
    }
}
