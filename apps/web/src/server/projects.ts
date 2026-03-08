import '@tanstack/react-start/server-only';
import { db } from '@repo/db';
import type { CreateProjectInput, Project, UpdateProjectInput } from '@repo/db/schema';
import { ObjectId } from 'mongodb';

const projects = db.collection('projects');
const auditLogs = db.collection('audit_logs');

export async function listProjects(userEmail: string, includeArchived = false) {
    const filter: Record<string, unknown> = {
        $or: [{ createdBy: userEmail }, { 'collaborators.email': userEmail }]
    };
    if (!includeArchived) {
        filter.archived = { $ne: true };
    }
    const docs = await projects.find(filter).sort({ updatedAt: -1 }).toArray();
    return docs.map(serializeProject);
}

export async function listPublishedProjects() {
    const docs = await projects
        .find({ publishedCommitId: { $ne: null }, archived: { $ne: true } })
        .sort({ updatedAt: -1 })
        .toArray();
    return docs.map(serializeProject);
}

export async function getProject(id: string) {
    const doc = await projects.findOne({ _id: new ObjectId(id) });
    if (!doc) return null;
    return serializeProject(doc);
}

export async function createProject(input: CreateProjectInput, userEmail: string) {
    const now = new Date().toISOString();
    const doc = {
        ...input,
        collaborators: [{ email: userEmail, role: 'owner' as const }, ...input.collaborators],
        headCommitId: null,
        publishedCommitId: null,
        archived: false,
        createdBy: userEmail,
        createdAt: now,
        updatedAt: now
    };
    const result = await projects.insertOne(doc);

    await auditLogs.insertOne({
        projectId: result.insertedId,
        actorId: userEmail,
        action: 'PROJECT_CREATED',
        changes: { name: input.name },
        createdAt: new Date()
    });

    return serializeProject({ ...doc, _id: result.insertedId });
}

export async function updateProject(input: UpdateProjectInput, userEmail: string) {
    const { _id, ...updates } = input;
    const existing = await projects.findOne({ _id: new ObjectId(_id) });
    if (!existing) throw new Error('Project not found');

    assertCanEdit(existing, userEmail);

    const result = await projects.findOneAndUpdate(
        { _id: new ObjectId(_id) },
        { $set: { ...updates, updatedAt: new Date().toISOString() } },
        { returnDocument: 'after' }
    );
    if (!result) throw new Error('Update failed');

    await auditLogs.insertOne({
        projectId: new ObjectId(_id),
        actorId: userEmail,
        action: 'PROJECT_UPDATED',
        changes: updates,
        createdAt: new Date()
    });

    return serializeProject(result);
}

export async function archiveProject(id: string, userEmail: string) {
    const existing = await projects.findOne({ _id: new ObjectId(id) });
    if (!existing) throw new Error('Project not found');
    assertCanEdit(existing, userEmail);

    await projects.updateOne(
        { _id: new ObjectId(id) },
        { $set: { archived: true, updatedAt: new Date().toISOString() } }
    );

    await auditLogs.insertOne({
        projectId: new ObjectId(id),
        actorId: userEmail,
        action: 'PROJECT_UPDATED',
        changes: { archived: true },
        createdAt: new Date()
    });
}

export async function restoreProject(id: string, userEmail: string) {
    const existing = await projects.findOne({ _id: new ObjectId(id) });
    if (!existing) throw new Error('Project not found');
    assertCanEdit(existing, userEmail);

    await projects.updateOne(
        { _id: new ObjectId(id) },
        { $set: { archived: false, updatedAt: new Date().toISOString() } }
    );

    await auditLogs.insertOne({
        projectId: new ObjectId(id),
        actorId: userEmail,
        action: 'PROJECT_UPDATED',
        changes: { archived: false },
        createdAt: new Date()
    });
}

export async function publishCommit(projectId: string, commitId: string | null, userEmail: string) {
    const existing = await projects.findOne({ _id: new ObjectId(projectId) });
    if (!existing) throw new Error('Project not found');
    assertCanEdit(existing, userEmail);

    const tags: string[] = existing.tags || [];
    const isPublishing = commitId !== null;

    const updatedTags = isPublishing
        ? tags.includes('public')
            ? tags
            : [...tags, 'public']
        : tags.filter((t: string) => t !== 'public');

    await projects.updateOne(
        { _id: new ObjectId(projectId) },
        {
            $set: {
                publishedCommitId: commitId,
                tags: updatedTags,
                updatedAt: new Date().toISOString()
            }
        }
    );

    await auditLogs.insertOne({
        projectId: new ObjectId(projectId),
        actorId: userEmail,
        action: 'PROJECT_UPDATED',
        changes: { publishedCommitId: commitId },
        createdAt: new Date()
    });

    return isPublishing;
}

export interface SerializedAuditLog {
    _id: string;
    projectId: string;
    actorId: string;
    action: string;
    changes: Record<string, string | number | boolean | null> | null;
    createdAt: string;
}

export async function getAuditLogs(projectId: string): Promise<SerializedAuditLog[]> {
    const docs = await auditLogs
        .find({ projectId: new ObjectId(projectId) })
        .sort({ createdAt: -1 })
        .toArray();
    return docs.map((d) => ({
        _id: d._id.toString(),
        projectId: d.projectId.toString(),
        actorId: String(d.actorId ?? ''),
        action: String(d.action ?? ''),
        changes: (d.changes as SerializedAuditLog['changes']) ?? null,
        createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt)
    }));
}

export interface SerializedCommit {
    _id: string;
    projectId: string;
    parentId: string | null;
    authorId: string | null;
    message: string;
    createdAt: string;
}

export async function getProjectCommits(projectId: string): Promise<SerializedCommit[]> {
    const commits = db.collection('commits');
    const docs = await commits
        .find({ projectId: new ObjectId(projectId) })
        .sort({ createdAt: -1 })
        .toArray();
    return docs.map((d) => ({
        _id: d._id.toString(),
        projectId: d.projectId.toString(),
        parentId: d.parentId?.toString() ?? null,
        authorId: d.authorId?.toString() ?? null,
        message: String(d.message ?? ''),
        createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt)
    }));
}

function assertCanEdit(doc: Record<string, unknown>, userEmail: string) {
    const collaborators = (doc.collaborators || []) as Array<{
        email: string;
        role: string;
    }>;
    const collab = collaborators.find((c) => c.email === userEmail);
    if (!collab || collab.role === 'viewer') {
        throw new Error('You do not have permission to edit this project');
    }
}

function serializeProject(doc: Record<string, unknown>): Project {
    return {
        ...doc,
        _id: doc._id!.toString(),
        headCommitId: doc.headCommitId?.toString() ?? null,
        publishedCommitId: doc.publishedCommitId?.toString() ?? null
    } as Project;
}
