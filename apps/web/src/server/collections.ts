import '@tanstack/react-start/server-only';
import { db } from '@repo/db';

import { JobDocument } from '~/lib/jobs/types';

export const collections = {
    users: db.collection('user'),
    sessions: db.collection('session'),
    projects: db.collection('projects'),
    commits: db.collection('commits'),
    assets: db.collection('assets'),
    walls: db.collection('walls'),
    devices: db.collection('devices'),
    jobs: db.collection<JobDocument>('jobs'),
    ydocs: db.collection('ydocs'),
    auditLogs: db.collection('audit_logs')
} as const;
