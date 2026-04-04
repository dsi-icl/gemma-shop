import '@tanstack/react-start/server-only';
import type { Db } from 'mongodb';

import type { YDocDocument } from '../documents';
import { BaseCollection } from './_base';

export class YDocsCollection extends BaseCollection<YDocDocument> {
    readonly collectionName = 'ydocs';
    protected readonly epochFields = [] as const;

    constructor(db: Db) {
        super(db.collection(YDocsCollection.prototype.collectionName));
    }

    async findByScope(scope: string): Promise<YDocDocument | null> {
        return this.findOne({ scope });
    }
}
