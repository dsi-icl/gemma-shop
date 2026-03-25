import type { CollectionMigrationStep } from '~/server/migrations/types';

export const projects_v0_to_v1: CollectionMigrationStep<'projects'> = {
    id: 'projects_v0_to_v1',
    collection: 'projects',
    from: 0,
    to: 1,
    description: 'Backfill _schemaVersion on existing project documents.',
    async run(database) {
        await database
            .collection('projects')
            .updateMany({ _schemaVersion: { $exists: false } }, { $set: { _schemaVersion: 1 } });
    }
};
