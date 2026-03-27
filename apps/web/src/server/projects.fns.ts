import { authMiddleware } from '@repo/auth/tanstack/middleware';
import { CreateAssetInput, CreateProjectInput, UpdateProjectInput } from '@repo/db/schema';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { createUploadToken, validateUploadToken } from '~/lib/uploadTokens';

import {
    archiveProject,
    copySlideInCommit,
    createAsset,
    createBranchHead,
    createProject,
    deleteAsset,
    deleteSlideFromCommit,
    ensureMutableHead,
    getAuditLogs,
    getCommit,
    getProject,
    getProjectCommits,
    listAssets,
    listKnownTags,
    listProjects,
    listPublishedProjects,
    promoteBranchHead,
    publishCommit,
    publishCustomRenderProject,
    restoreProject,
    revokeUploadTokenForActor,
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

export const $listKnownTags = createServerFn({ method: 'GET' })
    .middleware([authMiddleware])
    .handler(async ({ context }) => {
        return listKnownTags(context.user.email);
    });

export const $listAssets = createServerFn({ method: 'GET' })
    .inputValidator(z.object({ projectId: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        return listAssets(data.projectId, context.user.email);
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

export const $getCommit = createServerFn({ method: 'GET' })
    .inputValidator(z.object({ id: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        const commit = await getCommit(data.id);
        if (!commit) throw new Error('Commit not found');

        const project = await getProject(commit.projectId);
        if (!project) throw new Error('Project not found');

        const isCollaborator = project.collaborators.some((c) => c.email === context.user.email);
        if (project.createdBy !== context.user.email && !isCollaborator) {
            throw new Error('Access denied');
        }

        return commit;
    });

export const $createProject = createServerFn({ method: 'POST' })
    .inputValidator(CreateProjectInput)
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        return createProject(data, context.user.email);
    });

export const $createAsset = createServerFn({ method: 'POST' })
    .inputValidator(CreateAssetInput)
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        return createAsset(data, context.user.email);
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

export const $deleteAsset = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ id: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        await deleteAsset(data.id, context.user.email);
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

export const $publishCustomRenderProject = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ projectId: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        return publishCustomRenderProject(data.projectId, context.user.email);
    });

export const $getAuditLogs = createServerFn({ method: 'GET' })
    .inputValidator(z.object({ projectId: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        return getAuditLogs(data.projectId, context.user.email);
    });

export const $ensureMutableHead = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ projectId: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        return ensureMutableHead(data.projectId, context.user.email);
    });

export const $getProjectCommits = createServerFn({ method: 'GET' })
    .inputValidator(z.object({ projectId: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ data }) => {
        return getProjectCommits(data.projectId);
    });

export const $createBranchHead = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ projectId: z.string(), sourceCommitId: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        return createBranchHead(data.projectId, data.sourceCommitId, context.user.email);
    });

export const $promoteBranchHead = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ projectId: z.string(), branchCommitId: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        return promoteBranchHead(data.projectId, data.branchCommitId, context.user.email);
    });

// ── Slide operations ─────────────────────────────────────────────────────────

export const $copySlideInCommit = createServerFn({ method: 'POST' })
    .inputValidator(
        z.object({
            commitId: z.string(),
            sourceSlideId: z.string(),
            newSlideId: z.string(),
            newSlideName: z.string()
        })
    )
    .middleware([authMiddleware])
    .handler(async ({ data }) => {
        return copySlideInCommit(
            data.commitId,
            data.sourceSlideId,
            data.newSlideId,
            data.newSlideName
        );
    });

export const $deleteSlideFromCommit = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ commitId: z.string(), slideId: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ data }) => {
        return deleteSlideFromCommit(data.commitId, data.slideId);
    });

// ── Upload tokens ─────────────────────────────────────────────────────────────

export const $createUploadToken = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ projectId: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        return createUploadToken(data.projectId, context.user.email);
    });

export const $revokeUploadToken = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ token: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        await revokeUploadTokenForActor(data.token, context.user.email);
    });

export const $validateUploadToken = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ token: z.string() }))
    .handler(async ({ data }) => {
        return validateUploadToken(data.token);
    });
