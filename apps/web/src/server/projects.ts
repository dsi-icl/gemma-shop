import '@tanstack/react-start/server-only';
import { db } from '@repo/db';
import type {
    Asset,
    CreateAssetInput,
    CreateProjectInput,
    Project,
    UpdateProjectInput
} from '@repo/db/schema';
import { ObjectId } from 'mongodb';

import { scopedState, updateProjectCustomRenderSettings } from '~/lib/busState';

const projects = db.collection('projects');
const auditLogs = db.collection('audit_logs');
const assets = db.collection('assets');
const commits = db.collection('commits');

function serializeForClient<T>(value: T): T {
    if (value instanceof ObjectId) {
        return value.toHexString() as T;
    }
    if (value instanceof Date) {
        return value.toISOString() as T;
    }
    if (Array.isArray(value)) {
        return value.map((item) => serializeForClient(item)) as T;
    }
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = serializeForClient(v);
        }
        return out as T;
    }
    return value;
}

function idToString(value: unknown): string {
    if (value instanceof ObjectId) return value.toHexString();
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '';
    return JSON.stringify(value);
}

function scalarToString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return `${value}`;
    }
    if (value === null || value === undefined) return '';
    return JSON.stringify(value);
}

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
    const docs = await projects
        .find({
            publishedCommitId: { $ne: null },
            deletedAt: { $exists: false }
        })
        .sort({ updatedAt: -1 })
        .toArray();

    const serialized = docs.map(serializeProject);
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

export async function listAssets(projectId: string, userEmail: string) {
    const project = await getProject(projectId);
    if (!project) throw new Error('Project not found');

    assertCanView(project, userEmail);

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

export async function listPublicAssets() {
    const docs = await assets
        .find({ public: true, deletedAt: { $exists: false } })
        .sort({ createdAt: -1 })
        .toArray();
    return docs.map(serializeAsset);
}

export async function deletePublicAsset(assetId: string, userEmail: string) {
    const asset = await assets.findOne({
        _id: new ObjectId(assetId),
        public: true,
        deletedAt: { $exists: false }
    });
    if (!asset) throw new Error('Public asset not found');

    await assets.updateOne(
        { _id: new ObjectId(assetId) },
        {
            $set: {
                deletedAt: new Date().toISOString(),
                deletedBy: userEmail
            }
        }
    );
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
        headCommitId: null,
        publishedCommitId: null,
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

export async function createAsset(input: CreateAssetInput, userEmail: string) {
    const project = await getProject(input.projectId);
    if (!project) throw new Error('Project not found');

    assertCanEdit(project, userEmail);

    const now = new Date().toISOString();
    const doc = {
        ...input,
        projectId: new ObjectId(input.projectId),
        createdBy: userEmail,
        createdAt: now
    };

    const result = await assets.insertOne(doc);

    return serializeAsset({ ...doc, _id: result.insertedId });
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
    assertCanEdit(existing, userEmail);

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

    await auditLogs.insertOne({
        projectId: new ObjectId(id),
        actorId: userEmail,
        action: 'PROJECT_UPDATED',
        changes: { deletedAt: true },
        createdAt: new Date()
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

    assertCanEdit(project, userEmail);

    await assets.updateOne(
        { _id: new ObjectId(assetId) },
        {
            $set: {
                deletedAt: new Date().toISOString(),
                deletedBy: userEmail
            }
        }
    );
}

export async function restoreProject(id: string, userEmail: string) {
    const existing = await projects.findOne({ _id: new ObjectId(id) });
    if (!existing) throw new Error('Project not found');
    assertCanEdit(existing, userEmail);

    await projects.updateOne(
        { _id: new ObjectId(id) },
        {
            $set: { updatedAt: new Date().toISOString() },
            $unset: { deletedAt: '', deletedBy: '' }
        }
    );

    await auditLogs.insertOne({
        projectId: new ObjectId(id),
        actorId: userEmail,
        action: 'PROJECT_UPDATED',
        changes: { deletedAt: false },
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
    assertCanEdit(existing, userEmail);
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
    assertCanEdit(project, userEmail);

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
    assertCanEdit(project, userEmail);

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
    assertCanEdit(project, userEmail);

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

    await auditLogs.insertOne({
        projectId: new ObjectId(projectId),
        actorId: userEmail,
        action: 'BRANCH_PROMOTED',
        changes: { headCommitId: branchCommitId },
        createdAt: new Date()
    });
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
        changes:
            (d.changes ? (serializeForClient(d.changes) as SerializedAuditLog['changes']) : null) ??
            null,
        createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt)
    }));
}

export interface SerializedCommit {
    _id: string;
    projectId: string;
    parentId: string | null;
    authorId: string | null;
    message: string;
    isMutableHead: boolean;
    isAutoSave: boolean;
    firstSlideId: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface SerializedCommitWithContent extends SerializedCommit {
    content: {
        slides: {
            id: string;
            name: string;
            order: number;
            layers: any[];
        }[];
    };
}

export async function getProjectCommits(projectId: string): Promise<SerializedCommit[]> {
    const commits = db.collection('commits');
    const docs = await commits
        .find({ projectId: new ObjectId(projectId) })
        .sort({ createdAt: -1 })
        .toArray();
    return docs.map((d) => {
        const slides = (d.content as any)?.slides as Array<{ id: string }> | undefined;
        return {
            _id: d._id.toString(),
            projectId: d.projectId.toString(),
            parentId: d.parentId?.toString() ?? null,
            authorId: d.authorId?.toString() ?? null,
            message: String(d.message ?? ''),
            isMutableHead: Boolean(d.isMutableHead),
            isAutoSave: Boolean(d.isAutoSave),
            firstSlideId: slides?.[0]?.id ?? null,
            createdAt:
                d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
            updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : String(d.updatedAt)
        };
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

export function assertCanView(doc: Record<string, unknown>, userEmail: string) {
    const collaborators = (doc.collaborators || []) as Array<{
        email: string;
        role: string;
    }>;
    const isCollaborator = collaborators.some((c) => c.email === userEmail);
    if (doc.createdBy !== userEmail && !isCollaborator) {
        throw new Error('You do not have permission to view this project');
    }
}

export function assertCanEdit(doc: Record<string, unknown>, userEmail: string) {
    const collaborators = (doc.collaborators || []) as Array<{
        email: string;
        role: string;
    }>;
    const collab = collaborators.find((c) => c.email === userEmail);
    if (!collab || collab.role === 'viewer') {
        throw new Error('You do not have permission to edit this project');
    }
}

function serializeAsset(doc: Record<string, unknown>): Asset {
    return serializeForClient({
        ...doc,
        _id: idToString(doc._id),
        projectId: idToString(doc.projectId)
    } as Asset);
}

function serializeProject(doc: Record<string, unknown>): Project {
    return serializeForClient({
        ...doc,
        _id: idToString(doc._id),
        headCommitId: doc.headCommitId ? idToString(doc.headCommitId) : null,
        publishedCommitId: doc.publishedCommitId ? idToString(doc.publishedCommitId) : null
    } as Project);
}

function serializeCommit(doc: Record<string, unknown>): SerializedCommitWithContent {
    const content = doc.content as SerializedCommitWithContent['content'];
    return serializeForClient({
        _id: idToString(doc._id),
        projectId: idToString(doc.projectId),
        parentId: doc.parentId ? idToString(doc.parentId) : null,
        authorId: doc.authorId ? idToString(doc.authorId) : null,
        message: scalarToString(doc.message),
        isMutableHead: Boolean(doc.isMutableHead),
        isAutoSave: Boolean(doc.isAutoSave),
        firstSlideId: content?.slides?.[0]?.id ?? null,
        createdAt:
            doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
        updatedAt:
            doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : String(doc.updatedAt),
        content
    });
}
