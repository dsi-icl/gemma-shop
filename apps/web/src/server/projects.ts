import '@tanstack/react-start/server-only';
import type { CreateProjectInput, UpdateProjectInput } from '@repo/db/schema';
import { ObjectId } from 'mongodb';

import { scopedState, updateProjectCustomRenderSettings } from '~/lib/busState';
import { revokeUploadToken, validateUploadToken } from '~/lib/uploadTokens';
import { logAuditSuccess } from '~/server/audit';
import { collections } from '~/server/collections';
import { serializeAsset } from '~/server/serializers/asset.serializer';
import { serializeAudit } from '~/server/serializers/audit.serializer';
import { serializeCommit } from '~/server/serializers/commit.serializer';
import { serializeProject } from '~/server/serializers/project.serializer';

const projects = collections.projects;
const auditLogs = collections.auditLogs;
const assets = collections.assets;
const commits = collections.commits;

function normalizeAssetFilename(value: unknown): string | null {
    if (typeof value !== 'string' || value.length === 0) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const noQuery = trimmed.split('?')[0]?.split('#')[0] ?? trimmed;
    if (noQuery.startsWith('/api/assets/')) {
        const filename = noQuery.slice('/api/assets/'.length);
        return filename || null;
    }
    return noQuery;
}

export async function listProjects(userEmail: string, includeArchived = false) {
    const filter: Record<string, unknown> = {
        $or: [{ createdBy: userEmail }, { 'collaborators.email': userEmail }]
    };
    if (!includeArchived) {
        filter.deletedAt = { $exists: false };
    }
    const docs = await projects.find(filter).sort({ updatedAt: -1 }).toArray();
    return docs.map(serializeProject);
}

export async function listPublishedProjects() {
    const projects = await collections.projects
        .find({ deletedAt: { $exists: false } })
        .sort({ updatedAt: -1 })
        .toArray();

    const visibleProjects = projects.filter((doc: any) => {
        const visibility = doc.visibility === 'public' ? 'public' : 'private';
        const hasPublishedCommit = Boolean(doc.publishedCommitId);
        if (visibility === 'public' && hasPublishedCommit) return true;
        const tags = Array.isArray(doc.tags) ? doc.tags : [];
        const hasPublicTag = tags.some(
            (tag: unknown) => typeof tag === 'string' && tag === 'public'
        );
        return hasPublishedCommit || hasPublicTag;
    });

    const serialized = visibleProjects.map(serializeProject);
    const heroFilenames = Array.from(
        new Set(
            serialized
                .map((project) => normalizeAssetFilename(project.heroImages?.[0]))
                .filter((value): value is string => Boolean(value))
        )
    );

    if (heroFilenames.length === 0) return serialized;

    const heroAssets = await assets
        .find({ url: { $in: heroFilenames }, deletedAt: { $exists: false } })
        .project({ url: 1, blurhash: 1, sizes: 1 })
        .toArray();

    const heroMetaByFilename = new Map<
        string,
        {
            blurhash?: string;
            sizes?: number[];
        }
    >();

    for (const asset of heroAssets) {
        const filename = normalizeAssetFilename(asset.url);
        if (!filename) continue;
        heroMetaByFilename.set(filename, {
            blurhash: typeof asset.blurhash === 'string' ? asset.blurhash : undefined,
            sizes: Array.isArray(asset.sizes)
                ? asset.sizes.filter((size): size is number => typeof size === 'number')
                : undefined
        });
    }

    return serialized.map((project) => {
        const heroImageMeta = (Array.isArray(project.heroImages) ? project.heroImages : [])
            .map((src) => {
                const filename = normalizeAssetFilename(src);
                const meta = filename ? heroMetaByFilename.get(filename) : undefined;
                return {
                    src,
                    blurhash: meta?.blurhash,
                    sizes: meta?.sizes
                };
            })
            .filter((entry) => Boolean(entry.src));
        const firstHeroMeta = heroImageMeta[0];
        return {
            ...project,
            heroImageBlurhash: firstHeroMeta?.blurhash,
            heroImageSizes: firstHeroMeta?.sizes,
            heroImageMeta
        };
    });
}

export async function listKnownTags(userEmail: string): Promise<string[]> {
    const docs = await projects
        .find({
            $or: [{ createdBy: userEmail }, { 'collaborators.email': userEmail }]
        })
        .project({ tags: 1 })
        .toArray();

    const usage = new Map<string, number>();
    for (const doc of docs) {
        const tags = Array.isArray(doc.tags) ? doc.tags : [];
        for (const raw of tags) {
            if (typeof raw !== 'string') continue;
            const tag = raw.trim().toLowerCase();
            if (!tag || tag === 'public') continue;
            usage.set(tag, (usage.get(tag) ?? 0) + 1);
        }
    }

    return Array.from(usage.entries())
        .sort((a, b) => (b[1] === a[1] ? a[0].localeCompare(b[0]) : b[1] - a[1]))
        .map(([tag]) => tag);
}

export async function listAssets(projectId: string) {
    const project = await getProject(projectId);
    if (!project) throw new Error('Project not found');

    const [projectDocs, publicDocs] = await Promise.all([
        assets
            .find({ projectId: new ObjectId(projectId), deletedAt: { $exists: false } })
            .sort({ createdAt: -1 })
            .toArray(),
        assets
            .find({ public: true, deletedAt: { $exists: false } })
            .sort({ createdAt: -1 })
            .toArray()
    ]);

    const projectAssets = projectDocs.map(serializeAsset);
    const projectIds = new Set(projectAssets.map((a) => a._id));
    const publicAssets = publicDocs
        .filter((d) => !projectIds.has(d._id.toHexString()))
        .map(serializeAsset);

    return [...projectAssets, ...publicAssets];
}

export async function getProject(id: string) {
    const doc = await projects.findOne({ _id: new ObjectId(id) });
    if (!doc) return null;
    return serializeProject(doc);
}

export async function getCommit(id: string) {
    const doc = await commits.findOne({ _id: new ObjectId(id) });
    if (!doc) return null;
    return serializeCommit(doc);
}

export async function createProject(input: CreateProjectInput, userEmail: string) {
    const now = new Date().toISOString();
    const doc = {
        ...input,
        collaborators: [{ email: userEmail, role: 'owner' as const }, ...input.collaborators],
        visibility: input.visibility ?? 'private',
        headCommitId: null,
        publishedCommitId: null,
        createdBy: userEmail,
        createdAt: now,
        updatedAt: now
    };
    const result = await projects.insertOne(doc);

    await logAuditSuccess({
        action: 'PROJECT_CREATED',
        actorId: userEmail,
        projectId: result.insertedId,
        resourceType: 'project',
        resourceId: result.insertedId.toHexString(),
        changes: { name: input.name }
    });

    return serializeProject({ ...doc, _id: result.insertedId });
}

export async function updateProject(input: UpdateProjectInput, userEmail: string) {
    const { _id, ...updates } = input;
    const existing = await projects.findOne({ _id: new ObjectId(_id) });
    if (!existing) throw new Error('Project not found');

    const result = await projects.findOneAndUpdate(
        { _id: new ObjectId(_id) },
        { $set: { ...updates, updatedAt: new Date().toISOString() } },
        { returnDocument: 'after' }
    );
    if (!result) throw new Error('Update failed');

    await logAuditSuccess({
        action: 'PROJECT_UPDATED',
        actorId: userEmail,
        projectId: _id,
        resourceType: 'project',
        resourceId: _id,
        changes: updates as Record<string, unknown>
    });

    // Live-push custom render settings changes to any bound walls
    if (
        'customRenderUrl' in updates ||
        'customRenderCompat' in updates ||
        'customRenderProxy' in updates
    ) {
        updateProjectCustomRenderSettings(
            _id,
            updates.customRenderUrl ?? existing.customRenderUrl,
            updates.customRenderCompat,
            updates.customRenderProxy
        );
    }

    return serializeProject(result);
}

export async function archiveProject(id: string, userEmail: string) {
    const existing = await projects.findOne({ _id: new ObjectId(id) });
    if (!existing) throw new Error('Project not found');

    await projects.updateOne(
        { _id: new ObjectId(id) },
        {
            $set: {
                deletedAt: new Date().toISOString(),
                deletedBy: userEmail,
                updatedAt: new Date().toISOString()
            }
        }
    );

    await logAuditSuccess({
        action: 'PROJECT_ARCHIVED',
        actorId: userEmail,
        projectId: id,
        resourceType: 'project',
        resourceId: id,
        changes: { deletedAt: true }
    });
}

export async function deleteAsset(assetId: string, userEmail: string) {
    const asset = await assets.findOne({
        _id: new ObjectId(assetId),
        deletedAt: { $exists: false }
    });
    if (!asset) throw new Error('Asset not found');

    const project = await getProject(asset.projectId.toString());
    if (!project) throw new Error('Project not found');

    await assets.updateOne(
        { _id: new ObjectId(assetId) },
        {
            $set: {
                deletedAt: new Date().toISOString(),
                deletedBy: userEmail
            }
        }
    );
    await logAuditSuccess({
        action: 'ASSET_DELETED',
        actorId: userEmail,
        projectId: asset.projectId,
        resourceType: 'asset',
        resourceId: assetId
    });
}

export async function restoreProject(id: string, userEmail: string) {
    const existing = await projects.findOne({ _id: new ObjectId(id) });
    if (!existing) throw new Error('Project not found');

    await projects.updateOne(
        { _id: new ObjectId(id) },
        {
            $set: { updatedAt: new Date().toISOString() },
            $unset: { deletedAt: '', deletedBy: '' }
        }
    );

    await logAuditSuccess({
        action: 'PROJECT_RESTORED',
        actorId: userEmail,
        projectId: id,
        resourceType: 'project',
        resourceId: id,
        changes: { deletedAt: false }
    });
}

export async function publishCommit(projectId: string, commitId: string | null, userEmail: string) {
    const existing = await projects.findOne({ _id: new ObjectId(projectId) });
    if (!existing) throw new Error('Project not found');

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
                visibility: isPublishing ? 'public' : 'private',
                tags: updatedTags,
                updatedAt: new Date().toISOString()
            }
        }
    );

    await logAuditSuccess({
        action: commitId ? 'PROJECT_PUBLISHED' : 'PROJECT_UNPUBLISHED',
        actorId: userEmail,
        projectId,
        resourceType: 'project',
        resourceId: projectId,
        changes: { publishedCommitId: commitId }
    });

    process.__BROADCAST_PROJECT_PUBLISH_CHANGED__?.(projectId, commitId);

    return isPublishing;
}

/**
 * Publish a custom-render project by creating a sentinel commit (one empty slide, no layers)
 * and marking it as the published commit. If already published, this is a no-op.
 */
export async function publishCustomRenderProject(projectId: string, userEmail: string) {
    const existing = await projects.findOne({ _id: new ObjectId(projectId) });
    if (!existing) throw new Error('Project not found');
    if (!existing.customRenderUrl) throw new Error('Project has no custom render URL');

    // If already published, no-op
    if (existing.publishedCommitId) return true;

    const sentinelSlideId = new ObjectId().toHexString();
    const sentinel = {
        projectId: new ObjectId(projectId),
        parentId: null,
        authorId: new ObjectId(),
        message: 'Published (custom render)',
        content: { slides: [{ id: sentinelSlideId, order: 0, layers: [] }] },
        isAutoSave: false,
        isMutableHead: false,
        createdAt: new Date()
    };
    const result = await commits.insertOne(sentinel);
    const sentinelId = result.insertedId.toHexString();

    return publishCommit(projectId, sentinelId, userEmail);
}

/**
 * Ensure a project has a mutable HEAD commit. Creates one if missing or migrates
 * legacy immutable heads. Returns the stable HEAD commit ID.
 */
export async function ensureMutableHead(projectId: string, userEmail: string): Promise<string> {
    const project = await projects.findOne({ _id: new ObjectId(projectId) });
    if (!project) throw new Error('Project not found');

    // Case 1: HEAD exists and is already mutable
    if (project.headCommitId) {
        const head = await commits.findOne({ _id: new ObjectId(project.headCommitId) });
        if (head?.isMutableHead) {
            return project.headCommitId.toString();
        }

        // Case 2: HEAD exists but is immutable (legacy) — create mutable HEAD on top
        const newHead = {
            projectId: new ObjectId(projectId),
            parentId: new ObjectId(project.headCommitId),
            authorId: new ObjectId(),
            message: 'HEAD',
            content: head?.content ?? { slides: [] },
            isAutoSave: false,
            isMutableHead: true,
            createdAt: new Date()
        };
        const result = await commits.insertOne(newHead);
        await projects.updateOne(
            { _id: new ObjectId(projectId) },
            { $set: { headCommitId: result.insertedId, updatedAt: new Date().toISOString() } }
        );
        await logAuditSuccess({
            action: 'MUTABLE_HEAD_ENSURED',
            actorId: userEmail,
            projectId,
            resourceType: 'commit',
            resourceId: result.insertedId.toHexString(),
            changes: { source: 'legacy-head-migration' }
        });
        return result.insertedId.toHexString();
    }

    // Case 3: No HEAD at all — create fresh mutable HEAD with a default slide
    const defaultSlideId = new ObjectId().toHexString();
    const newHead = {
        projectId: new ObjectId(projectId),
        parentId: null,
        authorId: new ObjectId(),
        message: 'HEAD',
        content: { slides: [{ id: defaultSlideId, order: 0, layers: [] }] },
        isAutoSave: false,
        isMutableHead: true,
        createdAt: new Date()
    };
    const result = await commits.insertOne(newHead);
    await projects.updateOne(
        { _id: new ObjectId(projectId) },
        { $set: { headCommitId: result.insertedId, updatedAt: new Date().toISOString() } }
    );
    await logAuditSuccess({
        action: 'MUTABLE_HEAD_ENSURED',
        actorId: userEmail,
        projectId,
        resourceType: 'commit',
        resourceId: result.insertedId.toHexString(),
        changes: { source: 'head-created' }
    });
    return result.insertedId.toHexString();
}

/**
 * Create a new mutable branch head from any existing commit.
 * Does NOT change project.headCommitId — it's an independent branch.
 * Returns the new branch head's commit ID.
 */
export async function createBranchHead(
    projectId: string,
    sourceCommitId: string,
    userEmail: string
): Promise<string> {
    const project = await projects.findOne({ _id: new ObjectId(projectId) });
    if (!project) throw new Error('Project not found');

    const source = await commits.findOne({ _id: new ObjectId(sourceCommitId) });
    if (!source) throw new Error('Source commit not found');
    if (source.projectId.toString() !== projectId)
        throw new Error('Commit does not belong to project');

    const branchHead = {
        projectId: new ObjectId(projectId),
        parentId: new ObjectId(sourceCommitId),
        authorId: new ObjectId(),
        message: 'HEAD',
        content: source.content ?? { slides: [] },
        isAutoSave: false,
        isMutableHead: true,
        createdAt: new Date()
    };
    const result = await commits.insertOne(branchHead);
    await logAuditSuccess({
        action: 'BRANCH_HEAD_CREATED',
        actorId: userEmail,
        projectId,
        resourceType: 'commit',
        resourceId: result.insertedId.toHexString(),
        changes: { sourceCommitId }
    });
    return result.insertedId.toHexString();
}

/**
 * Promote a branch head to be the project's main HEAD.
 * The old HEAD remains as a branch (isMutableHead stays true).
 */
export async function promoteBranchHead(
    projectId: string,
    branchCommitId: string,
    userEmail: string
): Promise<void> {
    const project = await projects.findOne({ _id: new ObjectId(projectId) });
    if (!project) throw new Error('Project not found');

    const branch = await commits.findOne({ _id: new ObjectId(branchCommitId) });
    if (!branch) throw new Error('Branch commit not found');
    if (!branch.isMutableHead) throw new Error('Can only promote a mutable branch head');
    if (branch.projectId.toString() !== projectId)
        throw new Error('Commit does not belong to project');

    await projects.updateOne(
        { _id: new ObjectId(projectId) },
        {
            $set: {
                headCommitId: new ObjectId(branchCommitId),
                updatedAt: new Date().toISOString()
            }
        }
    );

    await logAuditSuccess({
        action: 'BRANCH_PROMOTED',
        actorId: userEmail,
        projectId,
        resourceType: 'project',
        resourceId: projectId,
        changes: { headCommitId: branchCommitId }
    });
}

export async function getAuditLogs(projectId: string) {
    const project = await projects.findOne({ _id: new ObjectId(projectId) });
    if (!project) throw new Error('Project not found');

    const docs = await auditLogs
        .find({ projectId: new ObjectId(projectId) })
        .sort({ createdAt: -1 })
        .toArray();
    return docs.map(serializeAudit);
}

export async function getProjectCommits(projectId: string) {
    const docs = await collections.commits
        .find({ projectId: new ObjectId(projectId) })
        .sort({ createdAt: -1 })
        .toArray();
    return docs.map((d) => {
        return serializeCommit(d);
    });
}

/**
 * Copy a slide's layers within a commit, assigning fresh numericIds to all copied layers.
 * Returns the new slide's id.
 */
export async function copySlideInCommit(
    commitId: string,
    sourceSlideId: string,
    newSlideId: string,
    newSlideName: string
): Promise<void> {
    const commit = await commits.findOne({ _id: new ObjectId(commitId) });
    if (!commit?.content?.slides) throw new Error('Commit not found');

    const slides = commit.content.slides as Array<{
        id: string;
        order: number;
        name?: string;
        layers: Array<Record<string, unknown>>;
    }>;
    const source = slides.find((s) => s.id === sourceSlideId);
    if (!source) throw new Error('Source slide not found');

    // Prefer live bus scope layers (may have unsaved changes) over commit data
    let sourceLayers: Array<Record<string, unknown>> = source.layers ?? [];
    for (const scope of scopedState.values()) {
        if (
            scope.commitId === commitId &&
            scope.slideId === sourceSlideId &&
            scope.layers.size > 0
        ) {
            sourceLayers = Array.from(scope.layers.values()) as Array<Record<string, unknown>>;
            break;
        }
    }

    // Find the highest numericId across ALL slides + live scopes to avoid conflicts
    let maxId = 0;
    for (const slide of slides) {
        for (const layer of slide.layers ?? []) {
            if (typeof layer.numericId === 'number' && layer.numericId > maxId) {
                maxId = layer.numericId;
            }
        }
    }
    // Also check all live scopes for the same commit (other slides may have unsaved layers)
    for (const scope of scopedState.values()) {
        if (scope.commitId === commitId) {
            for (const [numericId] of scope.layers) {
                if (numericId > maxId) maxId = numericId;
            }
        }
    }

    // Deep-copy layers with new numericIds
    const copiedLayers = sourceLayers.map((layer, i) => ({
        ...JSON.parse(JSON.stringify(layer)),
        numericId: maxId + i + 1
    }));

    const newSlide = {
        id: newSlideId,
        order: source.order + 0.5,
        name: newSlideName,
        layers: copiedLayers
    };

    const updatedSlides = [...slides, newSlide]
        .sort((a, b) => a.order - b.order)
        .map((s, i) => ({ ...s, order: i }));

    await commits.updateOne(
        { _id: new ObjectId(commitId) },
        { $set: { 'content.slides': updatedSlides, updatedAt: new Date() } }
    );
}

/**
 * Delete a slide from a commit document.
 * Returns false if it's the last slide (must keep at least one).
 */
export async function deleteSlideFromCommit(commitId: string, slideId: string): Promise<boolean> {
    const commit = await commits.findOne({ _id: new ObjectId(commitId) });
    if (!commit?.content?.slides) throw new Error('Commit not found');

    const slides = commit.content.slides as Array<{
        id: string;
        order: number;
        name?: string;
        layers: unknown[];
    }>;

    if (slides.length <= 1) return false;

    const updatedSlides = slides
        .filter((s) => s.id !== slideId)
        .sort((a, b) => a.order - b.order)
        .map((s, i) => ({ ...s, order: i }));

    await commits.updateOne(
        { _id: new ObjectId(commitId) },
        { $set: { 'content.slides': updatedSlides, updatedAt: new Date() } }
    );

    return true;
}

export async function revokeUploadTokenForActor(token: string, actorEmail: string): Promise<void> {
    const tokenData = validateUploadToken(token);
    if (!tokenData) return;

    if (tokenData.userEmail === actorEmail) {
        revokeUploadToken(token);
        return;
    }

    const project = await getProject(tokenData.projectId);
    if (project) {
        const collaborators = Array.isArray(project.collaborators)
            ? (project.collaborators as Array<{ email?: string; role?: string }>)
            : [];
        const isOwner = collaborators.some(
            (collaborator) => collaborator.email === actorEmail && collaborator.role === 'owner'
        );
        if (isOwner) {
            revokeUploadToken(token);
            return;
        }
    }

    const admin = await collections.users.findOne(
        { email: actorEmail, role: 'admin' },
        { projection: { _id: 1 } }
    );
    if (admin) {
        revokeUploadToken(token);
        return;
    }

    throw new Error('You do not have permission to revoke this upload token');
}
