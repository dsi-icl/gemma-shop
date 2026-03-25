import type { CollectionMigrationStep } from '~/server/migrations/types';
import type { VersionedCollection } from '~/server/schemaVersions';

import { assets_v0_to_v1 } from './steps/assets_v0_to_v1';
import { audit_logs_v0_to_v1 } from './steps/audit_logs_v0_to_v1';
import { commits_v0_to_v1 } from './steps/commits_v0_to_v1';
import { jobs_v0_to_v1 } from './steps/jobs_v0_to_v1';
import { projects_v0_to_v1 } from './steps/projects_v0_to_v1';
import { walls_v0_to_v1 } from './steps/walls_v0_to_v1';

export const MIGRATIONS_BY_COLLECTION: Record<VersionedCollection, CollectionMigrationStep[]> = {
    projects: [projects_v0_to_v1],
    assets: [assets_v0_to_v1],
    walls: [walls_v0_to_v1],
    commits: [commits_v0_to_v1],
    audit_logs: [audit_logs_v0_to_v1],
    jobs: [jobs_v0_to_v1]
};
