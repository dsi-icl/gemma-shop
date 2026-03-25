import '@tanstack/react-start/server-only';
import { hostname } from 'node:os';

import { db } from '@repo/db';

import { MIGRATIONS_BY_COLLECTION } from '~/server/migrations/manifest';
import {
    CURRENT_COLLECTION_SCHEMA_VERSIONS,
    VERSIONED_COLLECTIONS,
    type VersionedCollection
} from '~/server/schemaVersions';

const MIGRATION_LOCK_COLLECTION = 'migration_locks';
const MIGRATION_STATE_COLLECTION = 'schema_migrations';
const BOOT_MIGRATION_LOCK_ID = 'boot_schema_migrations';
const LOCK_LEASE_MS = 5 * 60 * 1000;

interface MigrationLockDocument {
    _id: string;
    owner?: string;
    leaseUntil?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

interface MigrationStateDocument {
    _id: VersionedCollection;
    version?: number;
    lastMigrationId?: string;
    updatedAt?: Date;
    updatedBy?: string;
    createdAt?: Date;
}

function migrationLocks() {
    return db.collection<MigrationLockDocument>(MIGRATION_LOCK_COLLECTION);
}

function migrationState() {
    return db.collection<MigrationStateDocument>(MIGRATION_STATE_COLLECTION);
}

export const STARTUP_MIGRATION_PUBLIC_ISSUE =
    'Service is temporarily unavailable while an internal update is being applied. Please try again shortly.';

export class StartupMigrationError extends Error {
    readonly publicMessage: string;

    constructor(message: string, options?: { cause?: unknown; publicMessage?: string }) {
        super(message);
        this.name = 'StartupMigrationError';
        this.cause = options?.cause;
        this.publicMessage = options?.publicMessage ?? STARTUP_MIGRATION_PUBLIC_ISSUE;
    }
}

function validateManifestIntegrity() {
    for (const collection of VERSIONED_COLLECTIONS) {
        const target = CURRENT_COLLECTION_SCHEMA_VERSIONS[collection];
        const steps = [...(MIGRATIONS_BY_COLLECTION[collection] ?? [])].sort(
            (a, b) => a.from - b.from
        );
        if (target === 0) continue;
        if (steps.length === 0) {
            throw new StartupMigrationError(
                `Missing migration path for "${collection}" to target schema version ${target}.`
            );
        }
        let expectedFrom = 0;
        for (const step of steps) {
            if (step.from !== expectedFrom || step.to !== expectedFrom + 1) {
                throw new StartupMigrationError(
                    `Invalid migration sequence for "${collection}" around step "${step.id}".`
                );
            }
            expectedFrom = step.to;
        }
        if (expectedFrom !== target) {
            throw new StartupMigrationError(
                `Migration path for "${collection}" ends at v${expectedFrom}, expected v${target}.`
            );
        }
    }
}

async function acquireMigrationLock(owner: string): Promise<void> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + LOCK_LEASE_MS);
    try {
        const lockDoc = await migrationLocks().findOneAndUpdate(
            {
                _id: BOOT_MIGRATION_LOCK_ID,
                $or: [{ owner }, { leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }]
            },
            {
                $set: { owner, leaseUntil, updatedAt: now },
                $setOnInsert: { createdAt: now }
            },
            { upsert: true, returnDocument: 'after' }
        );
        if (!lockDoc || lockDoc.owner !== owner) {
            throw new StartupMigrationError(
                'Another instance currently holds the schema migration lock.'
            );
        }
    } catch (error) {
        if ((error as { code?: number } | null)?.code === 11000) {
            throw new StartupMigrationError(
                'Another instance currently holds the schema migration lock.',
                {
                    cause: error
                }
            );
        }
        if (error instanceof StartupMigrationError) throw error;
        throw new StartupMigrationError('Failed to acquire schema migration lock.', {
            cause: error
        });
    }
}

async function releaseMigrationLock(owner: string): Promise<void> {
    await migrationLocks().updateOne(
        { _id: BOOT_MIGRATION_LOCK_ID, owner },
        {
            $set: { updatedAt: new Date() },
            $unset: { owner: '', leaseUntil: '' }
        }
    );
}

async function getCollectionVersion(collection: VersionedCollection): Promise<number> {
    const state = await migrationState().findOne({
        _id: collection
    });
    return typeof state?.version === 'number' ? state.version : 0;
}

async function setCollectionVersion(
    collection: VersionedCollection,
    version: number,
    lastMigrationId: string,
    owner: string
): Promise<void> {
    await migrationState().updateOne(
        { _id: collection },
        {
            $set: {
                version,
                lastMigrationId,
                updatedAt: new Date(),
                updatedBy: owner
            },
            $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
    );
}

export async function runBlockingSchemaMigrations(): Promise<void> {
    validateManifestIntegrity();
    const owner = `${hostname()}:${process.pid}`;
    await acquireMigrationLock(owner);
    try {
        for (const collection of VERSIONED_COLLECTIONS) {
            const targetVersion = CURRENT_COLLECTION_SCHEMA_VERSIONS[collection];
            let currentVersion = await getCollectionVersion(collection);

            if (currentVersion > targetVersion) {
                throw new StartupMigrationError(
                    `Database schema version for "${collection}" is v${currentVersion}, which is newer than app target v${targetVersion}.`
                );
            }

            while (currentVersion < targetVersion) {
                const nextStep = MIGRATIONS_BY_COLLECTION[collection].find(
                    (step) => step.from === currentVersion
                );
                if (!nextStep) {
                    throw new StartupMigrationError(
                        `No migration step found for "${collection}" v${currentVersion} -> v${currentVersion + 1}.`
                    );
                }
                await nextStep.run(db);
                await setCollectionVersion(collection, nextStep.to, nextStep.id, owner);
                currentVersion = nextStep.to;
            }
        }
    } catch (error) {
        if (error instanceof StartupMigrationError) throw error;
        throw new StartupMigrationError('Schema migration execution failed.', { cause: error });
    } finally {
        await releaseMigrationLock(owner).catch((err) => {
            console.error('[migrations] Failed to release lock:', err);
        });
    }
}
