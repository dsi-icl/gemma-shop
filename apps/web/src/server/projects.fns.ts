import { authMiddleware } from '@repo/auth/tanstack/middleware';
import { CreateProjectInput, UpdateProjectInput } from '@repo/db/schema';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import {
    archiveProject,
    createProject,
    getAuditLogs,
    getProject,
    getProjectCommits,
    listProjects,
    listPublishedProjects,
    publishCommit,
    restoreProject,
    updateProject
} from './projects';

export const $listProjects = createServerFn({ method: 'GET' })
    .inputValidator(z.object({ includeArchived: z.boolean().optional() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        return listProjects(context.user.email, data.includeArchived);
    });

export const $listPublishedProjects = createServerFn({ method: 'GET' }).handler(async () => {
    return listPublishedProjects();
});

export const $getProject = createServerFn({ method: 'GET' })
    .inputValidator(z.object({ id: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        const project = await getProject(data.id);
        if (!project) throw new Error('Project not found');

        const isCollaborator = project.collaborators.some((c) => c.email === context.user.email);
        if (project.createdBy !== context.user.email && !isCollaborator) {
            throw new Error('Access denied');
        }
        return project;
    });

export const $createProject = createServerFn({ method: 'POST' })
    .inputValidator(CreateProjectInput)
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        return createProject(data, context.user.email);
    });

export const $updateProject = createServerFn({ method: 'POST' })
    .inputValidator(UpdateProjectInput)
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        return updateProject(data, context.user.email);
    });

export const $archiveProject = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ id: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        await archiveProject(data.id, context.user.email);
    });

export const $restoreProject = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ id: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        await restoreProject(data.id, context.user.email);
    });

export const $publishCommit = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ projectId: z.string(), commitId: z.string().nullable() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        return publishCommit(data.projectId, data.commitId, context.user.email);
    });

export const $getAuditLogs = createServerFn({ method: 'GET' })
    .inputValidator(z.object({ projectId: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ data }) => {
        return getAuditLogs(data.projectId);
    });

export const $getProjectCommits = createServerFn({ method: 'GET' })
    .inputValidator(z.object({ projectId: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ data }) => {
        return getProjectCommits(data.projectId);
    });
