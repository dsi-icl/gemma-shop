import type { CollectionMigrationStep } from '~/server/migrations/types';

export const jobs_v0_to_v1: CollectionMigrationStep<'jobs'> = {
    id: 'jobs_v0_to_v1',
    collection: 'jobs',
    from: 0,
    to: 1,
    description: 'Backfill _schemaVersion on existing job documents.',
    async run(database) {
        await database
            .collection('jobs')
            .updateMany({ _schemaVersion: { $exists: false } }, { $set: { _schemaVersion: 1 } });
    }
};
