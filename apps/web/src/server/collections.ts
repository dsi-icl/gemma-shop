import '@tanstack/react-start/server-only';
import { db } from '@repo/db';
import { createCollections } from '@repo/db/collections';
import type {
    AuditLogDocument,
    AssetDocument,
    CommitDocument,
    DeviceDocument,
    ProjectDocument,
    SessionDocument,
    UserDocument,
    WallDocument,
    YDocDocument
} from '@repo/db/documents';

import { JobDocument } from '~/lib/jobs/types';

// ── Typed collection layer (Phase 1) ─────────────────────────────────────────
// Use these for all new code. Phase 3 will migrate remaining callsites below.

export const appCollections = createCollections(db);

// ── Raw MongoDB collections ───────────────────────────────────────────────────
// Retained for existing callsites until Phase 3 migration is complete.
// Better Auth collections (users, sessions) remain raw permanently —
// Better Auth owns their write path.

export const collections = {
    users: db.collection<UserDocument>('user'),
    sessions: db.collection<SessionDocument>('session'),
    projects: db.collection<ProjectDocument>('projects'),
    commits: db.collection<CommitDocument>('commits'),
    assets: db.collection<AssetDocument>('assets'),
    walls: db.collection<WallDocument>('walls'),
    devices: db.collection<DeviceDocument>('devices'),
    jobs: db.collection<JobDocument>('jobs'),
    ydocs: db.collection<YDocDocument>('ydocs'),
    auditLogs: db.collection<AuditLogDocument>('audit_logs')
} as const;
