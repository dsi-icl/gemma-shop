import type { CollectionMigrationStep } from '~/server/migrations/types';

export const audit_logs_v0_to_v1: CollectionMigrationStep<'audit_logs'> = {
    id: 'audit_logs_v0_to_v1',
    collection: 'audit_logs',
    from: 0,
    to: 1,
    description: 'Backfill _schemaVersion on existing audit log documents.',
    async run(database) {
        await database
            .collection('audit_logs')
            .updateMany({ _schemaVersion: { $exists: false } }, { $set: { _schemaVersion: 1 } });
    }
};
