import type { CollectionMigrationStep } from '~/server/migrations/types';

export const walls_v0_to_v1: CollectionMigrationStep<'walls'> = {
    id: 'walls_v0_to_v1',
    collection: 'walls',
    from: 0,
    to: 1,
    description: 'Backfill _schemaVersion on existing wall documents.',
    async run(database) {
        await database
            .collection('walls')
            .updateMany({ _schemaVersion: { $exists: false } }, { $set: { _schemaVersion: 1 } });
    }
};
