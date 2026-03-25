import type { Db } from 'mongodb';

import type { VersionedCollection } from '~/server/schemaVersions';

export interface CollectionMigrationStep<C extends VersionedCollection = VersionedCollection> {
    id: string;
    collection: C;
    from: number;
    to: number;
    description: string;
    run: (database: Db) => Promise<void>;
}
