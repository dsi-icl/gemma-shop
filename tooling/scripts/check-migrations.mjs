#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const SCHEMA_TO_COLLECTION = new Map([
    ['packages/db/src/schema/project.ts', 'projects'],
    ['packages/db/src/schema/asset.ts', 'assets'],
    ['packages/db/src/schema/wall.ts', 'walls'],
    ['packages/db/src/schema/commit.ts', 'commits'],
    ['packages/db/src/schema/audit.ts', 'audit_logs'],
    ['apps/web/src/lib/jobs/types.ts', 'jobs']
]);

function getChangedFiles() {
    try {
        const staged = execFileSync(
            'git',
            ['diff', '--name-only', '--cached', '--diff-filter=ACMR'],
            { encoding: 'utf8' }
        )
            .split('\n')
            .map((v) => v.trim())
            .filter(Boolean);
        if (staged.length > 0) return staged;

        const workingTree = execFileSync(
            'git',
            ['diff', '--name-only', 'HEAD', '--diff-filter=ACMR'],
            {
                encoding: 'utf8'
            }
        )
            .split('\n')
            .map((v) => v.trim())
            .filter(Boolean);
        return workingTree;
    } catch (error) {
        fail('Unable to read git diff for migration checks.', [
            error instanceof Error ? error.message : String(error)
        ]);
    }
}

function fail(message, extraLines = []) {
    console.error(`[check:migrations] ${message}`);
    for (const line of extraLines) {
        console.error(`  - ${line}`);
    }
    process.exit(1);
}

const changedFiles = getChangedFiles();
const touchedCollections = new Set();
for (const file of changedFiles) {
    const collection = SCHEMA_TO_COLLECTION.get(file);
    if (collection) touchedCollections.add(collection);
}

if (touchedCollections.size === 0) {
    console.log('[check:migrations] No schema changes detected.');
    process.exit(0);
}

const requiredGlobalFiles = [
    'apps/web/src/server/schemaVersions.ts',
    'apps/web/src/server/migrations/manifest.ts'
];

const missingGlobals = requiredGlobalFiles.filter((file) => !changedFiles.includes(file));
if (missingGlobals.length > 0) {
    fail('Schema changes detected without version/manifest updates.', missingGlobals);
}

const missingCollectionSteps = [];
for (const collection of touchedCollections) {
    const prefix = `apps/web/src/server/migrations/steps/${collection}_`;
    const hasCollectionStep = changedFiles.some((file) => file.startsWith(prefix));
    if (!hasCollectionStep) {
        missingCollectionSteps.push(`${collection} (expected ${prefix}*)`);
    }
}

if (missingCollectionSteps.length > 0) {
    fail('Missing migration step files for touched schema collections.', missingCollectionSteps);
}

console.log(
    `[check:migrations] OK. Valid migration updates detected for: ${Array.from(touchedCollections).join(', ')}.`
);
