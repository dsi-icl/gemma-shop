import '@tanstack/react-start/server-only';
import type { ProjectDocument } from '@repo/db/documents';
import { ObjectId } from 'mongodb';

import { validateUploadToken } from '~/lib/uploadTokens';
import { collections } from '~/server/collections';

type Actor = {
    email: string;
    role?: string;
};

const projects = collections.projects;
const commits = collections.commits;
const assets = collections.assets;

function isAdmin(role: string | null | undefined): boolean {
    return role === 'admin';
}

function hasProjectMembership(
    project: Pick<ProjectDocument, 'createdBy' | 'collaborators'>,
    email: string
): boolean {
    if (project.createdBy === email) return true;
    return project.collaborators.some((c) => c?.email === email);
}

function hasCollaboratorRole(
    project: Pick<ProjectDocument, 'collaborators'>,
    email: string,
    roles: string[]
): boolean {
    return project.collaborators.some((c) => c?.email === email && roles.includes(c?.role));
}

export async function canViewProject(actor: Actor, projectId: string): Promise<boolean> {
    if (!ObjectId.isValid(projectId)) return false;
    if (isAdmin(actor.role)) return true;
    const project = await projects.findOne(
        { _id: new ObjectId(projectId) },
        { projection: { createdBy: 1, collaborators: 1 } }
    );
    if (!project) return false;
    return hasProjectMembership(project, actor.email);
}

export async function canEditProject(actor: Actor, projectId: string): Promise<boolean> {
    if (!ObjectId.isValid(projectId)) return false;
    if (isAdmin(actor.role)) return true;
    const project = await projects.findOne(
        { _id: new ObjectId(projectId) },
        { projection: { collaborators: 1 } }
    );
    if (!project) return false;
    return hasCollaboratorRole(project, actor.email, ['owner', 'editor']);
}

export async function ownsProject(actor: Actor, projectId: string): Promise<boolean> {
    if (!ObjectId.isValid(projectId)) return false;
    if (isAdmin(actor.role)) return true;
    const project = await projects.findOne(
        { _id: new ObjectId(projectId) },
        { projection: { collaborators: 1 } }
    );
    if (!project) return false;
    return hasCollaboratorRole(project, actor.email, ['owner']);
}

export async function resolveProjectIdForCommit(commitId: string): Promise<string | null> {
    if (!ObjectId.isValid(commitId)) return null;
    const commit = await commits.findOne(
        { _id: new ObjectId(commitId) },
        { projection: { projectId: 1 } }
    );
    if (!commit?.projectId) return null;
    return String(commit.projectId);
}

export async function resolveProjectIdForAsset(assetId: string): Promise<string | null> {
    if (!ObjectId.isValid(assetId)) return null;
    const asset = await assets.findOne(
        { _id: new ObjectId(assetId) },
        { projection: { projectId: 1 } }
    );
    if (!asset?.projectId) return null;
    return String(asset.projectId);
}

export function resolveProjectIdForUploadToken(token: string): string | null {
    const data = validateUploadToken(token);
    return data?.projectId ?? null;
}

export function actorFromAuthContext(authContext: {
    user?: { email?: string | null; role?: string | null } | null;
}): Actor | null {
    const email = authContext.user?.email;
    if (!email) return null;
    return { email, role: authContext.user?.role ?? undefined };
}
