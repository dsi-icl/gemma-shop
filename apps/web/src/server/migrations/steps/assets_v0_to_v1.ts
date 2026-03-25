import type { CollectionMigrationStep } from '~/server/migrations/types';

export const assets_v0_to_v1: CollectionMigrationStep<'assets'> = {
    id: 'assets_v0_to_v1',
    collection: 'assets',
    from: 0,
    to: 1,
    description: 'Backfill _schemaVersion on existing asset documents.',
    async run(database) {
        await database
            .collection('assets')
            .updateMany({ _schemaVersion: { $exists: false } }, { $set: { _schemaVersion: 1 } });
    }
};
