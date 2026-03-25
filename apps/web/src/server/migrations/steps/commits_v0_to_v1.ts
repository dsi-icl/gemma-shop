import type { CollectionMigrationStep } from '~/server/migrations/types';

export const commits_v0_to_v1: CollectionMigrationStep<'commits'> = {
    id: 'commits_v0_to_v1',
    collection: 'commits',
    from: 0,
    to: 1,
    description: 'Backfill _schemaVersion on existing commit documents.',
    async run(database) {
        await database
            .collection('commits')
            .updateMany({ _schemaVersion: { $exists: false } }, { $set: { _schemaVersion: 1 } });
    }
};
