import { authMiddleware } from '@repo/auth/tanstack/middleware';
import { Collaborator, ProjectVisibility } from '@repo/db/schema';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { createUploadToken, validateUploadToken } from '~/lib/uploadTokens';

const CreateProjectInput = z.object({
    name: z.string().min(1, 'Name is required'),
    authorOrganisation: z.string().min(1, 'Author/Organisation is required'),
    description: z.string().default(''),
    tags: z.array(z.string()).default([]),
    visibility: ProjectVisibility.default('private'),
    heroImages: z.array(z.string()).default([]),
    customControlUrl: z.string().optional(),
    customRenderUrl: z.string().optional(),
    customRenderCompat: z.boolean().default(false),
    customRenderProxy: z.boolean().default(false),
    collaborators: z.array(Collaborator).default([])
});

const UpdateProjectInput = z.object({
    id: z.string(),
    name: z.string().min(1, 'Name is required').optional(),
    authorOrganisation: z.string().min(1, 'Author/Organisation is required').optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    visibility: ProjectVisibility.optional(),
    heroImages: z.array(z.string()).optional(),
    customControlUrl: z.string().optional(),
    customRenderUrl: z.string().optional(),
    customRenderCompat: z.boolean().optional(),
    customRenderProxy: z.boolean().optional(),
    collaborators: z.array(Collaborator).optional(),
    publishedCommitId: z.string().nullable().optional()
});
import { logAuditDenied, logAuditSuccess } from '~/server/audit';
import {
    actorFromAuthContext,
    canEditProject,
    canViewProject,
    ownsProject,
    resolveProjectIdForAsset,
    resolveProjectIdForCommit,
    resolveProjectIdForUploadToken
} from '~/server/projectAuthz';
import type { AuthContext } from '~/server/requestAuthContext';

import {
    archiveProject,
    copySlideInCommit,
    createBranchHead,
    createProject,
    deleteAsset,
    deleteSlideFromCommit,
    ensureMutableHead,
    getAudits,
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

function authContextFromServerFnContext(context: unknown): AuthContext {
    const c = context as
        | { authContext?: AuthContext; user?: { email?: string; role?: string } }
        | undefined;
    if (c?.authContext) return c.authContext;
    const email = c?.user?.email;
    const role = c?.user?.role;
    if (typeof email === 'string' && (role === 'admin' || role === 'user')) {
        return { user: { email, role } };
    }
    return { guest: true };
}

function buildProjectFnAuditContext(context: unknown, operation: string) {
    return {
        authContext: authContextFromServerFnContext(context),
        executionContext: {
            surface: 'serverfn' as const,
            operation
        }
    };
}

async function denyProjectFn(params: {
    context: unknown;
    operation: string;
    reasonCode: string;
    projectId?: string | null;
    resourceType?: 'project' | 'commit' | 'asset' | 'upload_token' | 'unknown';
    resourceId?: string | null;
}) {
    await logAuditDenied({
        action: 'PROJECTS_FN_ACCESS_DENIED',
        projectId: params.projectId ?? null,
        resourceType: params.resourceType ?? 'unknown',
        resourceId: params.resourceId ?? null,
        reasonCode: params.reasonCode,
        authContext: authContextFromServerFnContext(params.context),
        executionContext: {
            surface: 'serverfn',
            operation: params.operation
        }
    });
}

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
        const actor = actorFromAuthContext(context);
        if (!actor) {
            await denyProjectFn({
                context,
                operation: '$listAssets',
                reasonCode: 'MISSING_ACTOR',
                projectId: data.projectId,
                resourceType: 'project',
                resourceId: data.projectId
            });
            throw new Error('Access denied');
        }
        const allowed = await canViewProject(actor, data.projectId);
        if (!allowed) {
            await denyProjectFn({
                context,
                operation: '$listAssets',
                reasonCode: 'PROJECT_VIEW_FORBIDDEN',
                projectId: data.projectId,
                resourceType: 'project',
                resourceId: data.projectId
            });
            throw new Error('Access denied');
        }
        return listAssets(data.projectId);
    });

export const $getProject = createServerFn({ method: 'GET' })
    .inputValidator(z.object({ id: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        const project = await getProject(data.id);
        if (!project) throw new Error('Project not found');
        const actor = actorFromAuthContext(context);
        if (!actor) {
            await denyProjectFn({
                context,
                operation: '$getProject',
                reasonCode: 'MISSING_ACTOR',
                projectId: data.id,
                resourceType: 'project',
                resourceId: data.id
            });
            throw new Error('Access denied');
        }
        const allowed = await canViewProject(actor, data.id);
        if (!allowed) {
            await denyProjectFn({
                context,
                operation: '$getProject',
                reasonCode: 'PROJECT_VIEW_FORBIDDEN',
                projectId: data.id,
                resourceType: 'project',
                resourceId: data.id
            });
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
        const actor = actorFromAuthContext(context);
        if (!actor) {
            await denyProjectFn({
                context,
                operation: '$getCommit',
                reasonCode: 'MISSING_ACTOR',
                resourceType: 'commit',
                resourceId: data.id
            });
            throw new Error('Access denied');
        }
        const allowed = await canViewProject(actor, commit.projectId);
        if (!allowed) {
            await denyProjectFn({
                context,
                operation: '$getCommit',
                reasonCode: 'PROJECT_VIEW_FORBIDDEN',
                projectId: commit.projectId,
                resourceType: 'commit',
                resourceId: data.id
            });
            throw new Error('Access denied');
        }
        return commit;
    });

export const $createProject = createServerFn({ method: 'POST' })
    .inputValidator(CreateProjectInput)
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        return createProject(
            data,
            context.user.email,
            buildProjectFnAuditContext(context, '$createProject')
        );
    });

export const $updateProject = createServerFn({ method: 'POST' })
    .inputValidator(UpdateProjectInput)
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        const actor = actorFromAuthContext(context);
        if (!actor) {
            await denyProjectFn({
                context,
                operation: '$updateProject',
                reasonCode: 'MISSING_ACTOR',
                projectId: data.id,
                resourceType: 'project',
                resourceId: data.id
            });
            throw new Error('Access denied');
        }
        const allowed = await canEditProject(actor, data.id);
        if (!allowed) {
            await denyProjectFn({
                context,
                operation: '$updateProject',
                reasonCode: 'PROJECT_EDIT_FORBIDDEN',
                projectId: data.id,
                resourceType: 'project',
                resourceId: data.id
            });
            throw new Error('Access denied');
        }
        return updateProject(
            data,
            context.user.email,
            buildProjectFnAuditContext(context, '$updateProject')
        );
    });

export const $archiveProject = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ id: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        const actor = actorFromAuthContext(context);
        if (!actor) {
            await denyProjectFn({
                context,
                operation: '$archiveProject',
                reasonCode: 'MISSING_ACTOR',
                projectId: data.id,
                resourceType: 'project',
                resourceId: data.id
            });
            throw new Error('Access denied');
        }
        const allowed = await ownsProject(actor, data.id);
        if (!allowed) {
            await denyProjectFn({
                context,
                operation: '$archiveProject',
                reasonCode: 'PROJECT_OWNER_REQUIRED',
                projectId: data.id,
                resourceType: 'project',
                resourceId: data.id
            });
            throw new Error('Access denied');
        }
        await archiveProject(
            data.id,
            context.user.email,
            buildProjectFnAuditContext(context, '$archiveProject')
        );
    });

export const $deleteAsset = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ id: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        const projectId = await resolveProjectIdForAsset(data.id);
        if (!projectId) throw new Error('Asset not found');
        const actor = actorFromAuthContext(context);
        if (!actor) {
            await denyProjectFn({
                context,
                operation: '$deleteAsset',
                reasonCode: 'MISSING_ACTOR',
                projectId,
                resourceType: 'asset',
                resourceId: data.id
            });
            throw new Error('Access denied');
        }
        const allowed = await canEditProject(actor, projectId);
        if (!allowed) {
            await denyProjectFn({
                context,
                operation: '$deleteAsset',
                reasonCode: 'PROJECT_EDIT_FORBIDDEN',
                projectId,
                resourceType: 'asset',
                resourceId: data.id
            });
            throw new Error('Access denied');
        }
        await deleteAsset(
            data.id,
            context.user.email,
            buildProjectFnAuditContext(context, '$deleteAsset')
        );
    });

export const $restoreProject = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ id: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        const actor = actorFromAuthContext(context);
        if (!actor) {
            await denyProjectFn({
                context,
                operation: '$restoreProject',
                reasonCode: 'MISSING_ACTOR',
                projectId: data.id,
                resourceType: 'project',
                resourceId: data.id
            });
            throw new Error('Access denied');
        }
        const allowed = await canEditProject(actor, data.id);
        if (!allowed) {
            await denyProjectFn({
                context,
                operation: '$restoreProject',
                reasonCode: 'PROJECT_EDIT_FORBIDDEN',
                projectId: data.id,
                resourceType: 'project',
                resourceId: data.id
            });
            throw new Error('Access denied');
        }
        await restoreProject(
            data.id,
            context.user.email,
            buildProjectFnAuditContext(context, '$restoreProject')
        );
    });

export const $publishCommit = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ projectId: z.string(), commitId: z.string().nullable() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        const actor = actorFromAuthContext(context);
        if (!actor) {
            await denyProjectFn({
                context,
                operation: '$publishCommit',
                reasonCode: 'MISSING_ACTOR',
                projectId: data.projectId,
                resourceType: 'project',
                resourceId: data.projectId
            });
            throw new Error('Access denied');
        }
        const allowed = await canEditProject(actor, data.projectId);
        if (!allowed) {
            await denyProjectFn({
                context,
                operation: '$publishCommit',
                reasonCode: 'PROJECT_EDIT_FORBIDDEN',
                projectId: data.projectId,
                resourceType: 'project',
                resourceId: data.projectId
            });
            throw new Error('Access denied');
        }
        return publishCommit(
            data.projectId,
            data.commitId,
            context.user.email,
            buildProjectFnAuditContext(context, '$publishCommit')
        );
    });

export const $publishCustomRenderProject = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ projectId: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        const actor = actorFromAuthContext(context);
        if (!actor) {
            await denyProjectFn({
                context,
                operation: '$publishCustomRenderProject',
                reasonCode: 'MISSING_ACTOR',
                projectId: data.projectId,
                resourceType: 'project',
                resourceId: data.projectId
            });
            throw new Error('Access denied');
        }
        const allowed = await canEditProject(actor, data.projectId);
        if (!allowed) {
            await denyProjectFn({
                context,
                operation: '$publishCustomRenderProject',
                reasonCode: 'PROJECT_EDIT_FORBIDDEN',
                projectId: data.projectId,
                resourceType: 'project',
                resourceId: data.projectId
            });
            throw new Error('Access denied');
        }
        return publishCustomRenderProject(
            data.projectId,
            context.user.email,
            buildProjectFnAuditContext(context, '$publishCustomRenderProject')
        );
    });

export const $getAudits = createServerFn({ method: 'GET' })
    .inputValidator(z.object({ projectId: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        const actor = actorFromAuthContext(context);
        if (!actor) {
            await denyProjectFn({
                context,
                operation: '$getAudits',
                reasonCode: 'MISSING_ACTOR',
                projectId: data.projectId,
                resourceType: 'project',
                resourceId: data.projectId
            });
            throw new Error('Access denied');
        }
        const allowed = await canViewProject(actor, data.projectId);
        if (!allowed) {
            await denyProjectFn({
                context,
                operation: '$getAudits',
                reasonCode: 'PROJECT_VIEW_FORBIDDEN',
                projectId: data.projectId,
                resourceType: 'project',
                resourceId: data.projectId
            });
            throw new Error('Access denied');
        }
        return getAudits(data.projectId);
    });

export const $ensureMutableHead = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ projectId: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        const actor = actorFromAuthContext(context);
        if (!actor) {
            await denyProjectFn({
                context,
                operation: '$ensureMutableHead',
                reasonCode: 'MISSING_ACTOR',
                projectId: data.projectId,
                resourceType: 'project',
                resourceId: data.projectId
            });
            throw new Error('Access denied');
        }
        const allowed = await canEditProject(actor, data.projectId);
        if (!allowed) {
            await denyProjectFn({
                context,
                operation: '$ensureMutableHead',
                reasonCode: 'PROJECT_EDIT_FORBIDDEN',
                projectId: data.projectId,
                resourceType: 'project',
                resourceId: data.projectId
            });
            throw new Error('Access denied');
        }
        return ensureMutableHead(
            data.projectId,
            context.user.email,
            buildProjectFnAuditContext(context, '$ensureMutableHead')
        );
    });

export const $getProjectCommits = createServerFn({ method: 'GET' })
    .inputValidator(z.object({ projectId: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        const actor = actorFromAuthContext(context);
        if (!actor) {
            await denyProjectFn({
                context,
                operation: '$getProjectCommits',
                reasonCode: 'MISSING_ACTOR',
                projectId: data.projectId,
                resourceType: 'project',
                resourceId: data.projectId
            });
            throw new Error('Access denied');
        }
        const allowed = await canViewProject(actor, data.projectId);
        if (!allowed) {
            await denyProjectFn({
                context,
                operation: '$getProjectCommits',
                reasonCode: 'PROJECT_VIEW_FORBIDDEN',
                projectId: data.projectId,
                resourceType: 'project',
                resourceId: data.projectId
            });
            throw new Error('Access denied');
        }
        return getProjectCommits(data.projectId);
    });

export const $createBranchHead = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ projectId: z.string(), sourceCommitId: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        const actor = actorFromAuthContext(context);
        if (!actor) {
            await denyProjectFn({
                context,
                operation: '$createBranchHead',
                reasonCode: 'MISSING_ACTOR',
                projectId: data.projectId,
                resourceType: 'project',
                resourceId: data.projectId
            });
            throw new Error('Access denied');
        }
        const allowed = await canEditProject(actor, data.projectId);
        if (!allowed) {
            await denyProjectFn({
                context,
                operation: '$createBranchHead',
                reasonCode: 'PROJECT_EDIT_FORBIDDEN',
                projectId: data.projectId,
                resourceType: 'project',
                resourceId: data.projectId
            });
            throw new Error('Access denied');
        }
        return createBranchHead(
            data.projectId,
            data.sourceCommitId,
            context.user.email,
            buildProjectFnAuditContext(context, '$createBranchHead')
        );
    });

export const $promoteBranchHead = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ projectId: z.string(), branchCommitId: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        const actor = actorFromAuthContext(context);
        if (!actor) {
            await denyProjectFn({
                context,
                operation: '$promoteBranchHead',
                reasonCode: 'MISSING_ACTOR',
                projectId: data.projectId,
                resourceType: 'project',
                resourceId: data.projectId
            });
            throw new Error('Access denied');
        }
        const allowed = await canEditProject(actor, data.projectId);
        if (!allowed) {
            await denyProjectFn({
                context,
                operation: '$promoteBranchHead',
                reasonCode: 'PROJECT_EDIT_FORBIDDEN',
                projectId: data.projectId,
                resourceType: 'project',
                resourceId: data.projectId
            });
            throw new Error('Access denied');
        }
        return promoteBranchHead(
            data.projectId,
            data.branchCommitId,
            context.user.email,
            buildProjectFnAuditContext(context, '$promoteBranchHead')
        );
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
    .handler(async ({ context, data }) => {
        const projectId = await resolveProjectIdForCommit(data.commitId);
        if (!projectId) throw new Error('Commit not found');
        const actor = actorFromAuthContext(context);
        if (!actor) {
            await denyProjectFn({
                context,
                operation: '$copySlideInCommit',
                reasonCode: 'MISSING_ACTOR',
                projectId,
                resourceType: 'commit',
                resourceId: data.commitId
            });
            throw new Error('Access denied');
        }
        const allowed = await canEditProject(actor, projectId);
        if (!allowed) {
            await denyProjectFn({
                context,
                operation: '$copySlideInCommit',
                reasonCode: 'PROJECT_EDIT_FORBIDDEN',
                projectId,
                resourceType: 'commit',
                resourceId: data.commitId
            });
            throw new Error('Access denied');
        }
        return copySlideInCommit(
            data.commitId,
            data.sourceSlideId,
            data.newSlideId,
            data.newSlideName,
            context.user.email,
            buildProjectFnAuditContext(context, '$copySlideInCommit')
        );
    });

export const $deleteSlideFromCommit = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ commitId: z.string(), slideId: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        const projectId = await resolveProjectIdForCommit(data.commitId);
        if (!projectId) throw new Error('Commit not found');
        const actor = actorFromAuthContext(context);
        if (!actor) {
            await denyProjectFn({
                context,
                operation: '$deleteSlideFromCommit',
                reasonCode: 'MISSING_ACTOR',
                projectId,
                resourceType: 'commit',
                resourceId: data.commitId
            });
            throw new Error('Access denied');
        }
        const allowed = await canEditProject(actor, projectId);
        if (!allowed) {
            await denyProjectFn({
                context,
                operation: '$deleteSlideFromCommit',
                reasonCode: 'PROJECT_EDIT_FORBIDDEN',
                projectId,
                resourceType: 'commit',
                resourceId: data.commitId
            });
            throw new Error('Access denied');
        }
        return deleteSlideFromCommit(
            data.commitId,
            data.slideId,
            context.user.email,
            buildProjectFnAuditContext(context, '$deleteSlideFromCommit')
        );
    });

// ── Upload tokens ─────────────────────────────────────────────────────────────

export const $createUploadToken = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ projectId: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        const actor = actorFromAuthContext(context);
        if (!actor) {
            await denyProjectFn({
                context,
                operation: '$createUploadToken',
                reasonCode: 'MISSING_ACTOR',
                projectId: data.projectId,
                resourceType: 'project',
                resourceId: data.projectId
            });
            throw new Error('Access denied');
        }
        const allowed = await canEditProject(actor, data.projectId);
        if (!allowed) {
            await denyProjectFn({
                context,
                operation: '$createUploadToken',
                reasonCode: 'PROJECT_EDIT_FORBIDDEN',
                projectId: data.projectId,
                resourceType: 'project',
                resourceId: data.projectId
            });
            throw new Error('Access denied');
        }
        const token = createUploadToken(data.projectId, context.user.email);
        await logAuditSuccess({
            action: 'UPLOAD_TOKEN_CREATED',
            actorId: context.user.email,
            projectId: data.projectId,
            resourceType: 'upload_token',
            resourceId: `project:${data.projectId}`,
            ...buildProjectFnAuditContext(context, '$createUploadToken')
        });
        return token;
    });

export const $revokeUploadToken = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ token: z.string() }))
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        const projectId = resolveProjectIdForUploadToken(data.token);
        if (!projectId) return;
        const actor = actorFromAuthContext(context);
        if (!actor) {
            await denyProjectFn({
                context,
                operation: '$revokeUploadToken',
                reasonCode: 'MISSING_ACTOR',
                projectId,
                resourceType: 'upload_token'
            });
            throw new Error('Access denied');
        }
        const allowed = await canEditProject(actor, projectId);
        if (!allowed) {
            await denyProjectFn({
                context,
                operation: '$revokeUploadToken',
                reasonCode: 'PROJECT_EDIT_FORBIDDEN',
                projectId,
                resourceType: 'upload_token'
            });
            throw new Error('Access denied');
        }
        await revokeUploadTokenForActor(
            data.token,
            context.user.email,
            buildProjectFnAuditContext(context, '$revokeUploadToken')
        );
    });

export const $validateUploadToken = createServerFn({ method: 'POST' })
    .inputValidator(z.object({ token: z.string() }))
    .handler(async ({ data }) => {
        return validateUploadToken(data.token);
    });
