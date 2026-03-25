import '@tanstack/react-start/server-only';

export const VERSIONED_COLLECTIONS = [
    'projects',
    'assets',
    'walls',
    'commits',
    'audit_logs',
    'jobs'
] as const;

export type VersionedCollection = (typeof VERSIONED_COLLECTIONS)[number];

export const CURRENT_COLLECTION_SCHEMA_VERSIONS: Record<VersionedCollection, number> = {
    projects: 1,
    assets: 1,
    walls: 1,
    commits: 1,
    audit_logs: 1,
    jobs: 1
};

export function getCurrentCollectionSchemaVersion(collection: VersionedCollection): number {
    return CURRENT_COLLECTION_SCHEMA_VERSIONS[collection];
}

export function withSchemaVersion<T extends Record<string, unknown>>(
    collection: VersionedCollection,
    doc: T
): T & { _schemaVersion: number } {
    return {
        ...doc,
        _schemaVersion: getCurrentCollectionSchemaVersion(collection)
    };
}

export function schemaVersionOnInsert(collection: VersionedCollection): { _schemaVersion: number } {
    return {
        _schemaVersion: getCurrentCollectionSchemaVersion(collection)
    };
}
