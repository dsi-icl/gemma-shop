import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { basename, join, extname } from 'path';

import { auth } from '@repo/auth/auth';
import { db } from '@repo/db';
import { createFileRoute } from '@tanstack/react-router';
import { createServerOnlyFn } from '@tanstack/react-start';
import { ObjectId } from 'mongodb';

import { ASSET_MIME_TYPES } from '~/lib/assetMime';
import { ASSET_DIR } from '~/lib/serverVariables';
import { assertCanView } from '~/server/projects';

function parseVariantFilename(filename: string): { baseId: string; requested: number } | null {
    const m = filename.match(/^(.*)_([0-9]+)\.webp$/i);
    if (!m) return null;
    const requested = parseInt(m[2], 10);
    if (!Number.isFinite(requested) || requested <= 0) return null;
    return { baseId: m[1], requested };
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deriveRootId(filename: string): string | null {
    const parsedVariant = parseVariantFilename(filename);
    if (parsedVariant) return parsedVariant.baseId;
    const dot = filename.lastIndexOf('.');
    if (dot <= 0) return null;
    return filename.slice(0, dot);
}

interface AssetAccessContext {
    rootId: string;
    assetDoc: {
        projectId?: unknown;
        public?: boolean;
        url?: string;
        previewUrl?: string;
        sizes?: unknown[];
    };
}

async function resolveAssetAccessContext(
    requestedFilename: string
): Promise<AssetAccessContext | null> {
    const rootId = deriveRootId(requestedFilename);
    if (!rootId) return null;

    const escapedBase = escapeRegex(rootId);
    const assetDoc = (await db.collection('assets').findOne(
        {
            $or: [
                { url: requestedFilename },
                { previewUrl: requestedFilename },
                { url: { $regex: `^${escapedBase}\\.[^.]+$`, $options: 'i' } },
                { previewUrl: { $regex: `^${escapedBase}\\.[^.]+$`, $options: 'i' } }
            ]
        },
        {
            projection: {
                projectId: 1,
                public: 1,
                url: 1,
                previewUrl: 1,
                sizes: 1
            }
        }
    )) as AssetAccessContext['assetDoc'] | null;
    if (!assetDoc) return null;

    return { rootId, assetDoc };
}

async function chooseVariantFallbackFilename(
    requestedFilename: string,
    ctx: AssetAccessContext
): Promise<string | null> {
    const parsed = parseVariantFilename(requestedFilename);
    if (!parsed || parsed.baseId !== ctx.rootId) return null;

    const { requested } = parsed;
    const { rootId } = ctx;
    const assetMeta = ctx.assetDoc;

    const sizes = Array.from(
        new Set(
            (Array.isArray(assetMeta.sizes) ? assetMeta.sizes : [])
                .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0)
                .map((n) => Math.round(n))
        )
    ).sort((a, b) => a - b);

    const smallerOrEqualDesc = sizes.filter((s) => s <= requested).sort((a, b) => b - a);
    const largerAsc = sizes.filter((s) => s > requested).sort((a, b) => a - b);
    const candidateSizes = [...smallerOrEqualDesc, ...largerAsc];

    for (const size of candidateSizes) {
        const candidate = `${rootId}_${size}.webp`;
        const candidatePath = join(ASSET_DIR, candidate);
        const exists = await stat(candidatePath)
            .then((s) => s.isFile())
            .catch(() => false);
        if (exists) return candidate;
    }

    const baseOriginal = assetMeta.previewUrl || assetMeta.url || null;
    if (!baseOriginal) return null;
    const basePath = join(ASSET_DIR, baseOriginal);
    const baseExists = await stat(basePath)
        .then((s) => s.isFile())
        .catch(() => false);
    return baseExists ? baseOriginal : null;
}

function isFilenameAllowedByContext(requestedFilename: string, ctx: AssetAccessContext): boolean {
    if (requestedFilename === ctx.assetDoc.url || requestedFilename === ctx.assetDoc.previewUrl) {
        return true;
    }
    const parsed = parseVariantFilename(requestedFilename);
    return Boolean(parsed && parsed.baseId === ctx.rootId);
}

// TODO Remove this as we finish migrations to new project visibility structure
function isLegacyPublicProject(project: {
    tags?: unknown[];
    publishedCommitId?: unknown;
}): boolean {
    const hasPublishedCommit = Boolean(project.publishedCommitId);
    const tags = Array.isArray(project.tags) ? project.tags : [];
    const hasPublicTag = tags.some((tag) => typeof tag === 'string' && tag === 'public');
    return hasPublishedCommit || hasPublicTag;
}

async function enforceAssetAccessPolicy(
    ctx: AssetAccessContext,
    requestedFilename: string,
    userEmail: string | null
): Promise<void> {
    const { assetDoc } = ctx;

    if (assetDoc.public) {
        return;
    }

    const projectId =
        assetDoc.projectId instanceof ObjectId
            ? assetDoc.projectId
            : typeof assetDoc.projectId === 'string' && ObjectId.isValid(assetDoc.projectId)
              ? new ObjectId(assetDoc.projectId)
              : null;
    if (!projectId) {
        return;
    }

    const project = (await db.collection('projects').findOne(
        { _id: projectId, deletedAt: { $exists: false } },
        {
            projection: {
                createdBy: 1,
                collaborators: 1,
                tags: 1,
                publishedCommitId: 1
            }
        }
    )) as {
        createdBy?: string;
        collaborators?: Array<{ email?: string; role?: string }>;
        tags?: unknown[];
        publishedCommitId?: unknown;
    } | null;

    if (!project) {
        return;
    }

    if (isLegacyPublicProject(project)) {
        return;
    }

    if (userEmail) {
        assertCanView(project as Record<string, unknown>, userEmail);
        return;
    }

    console.warn(
        `[Assets] Legacy public read path used for private project asset filename=${requestedFilename}; visibility cutover pending`
    );
}

const getResponse = createServerOnlyFn(
    async ({
        uri,
        range,
        ifNoneMatch,
        userEmail
    }: {
        uri: string;
        range: string | null;
        ifNoneMatch: string | null;
        userEmail: string | null;
    }) => {
        const requestedFilename = basename(decodeURIComponent(uri));
        const accessContext = await resolveAssetAccessContext(requestedFilename);
        if (!accessContext) {
            return new Response('Not Found', { status: 404 });
        }
        if (!isFilenameAllowedByContext(requestedFilename, accessContext)) {
            return new Response('Not Found', { status: 404 });
        }
        await enforceAssetAccessPolicy(accessContext, requestedFilename, userEmail);

        let resolvedFilename = requestedFilename;
        let asset = join(ASSET_DIR, resolvedFilename);

        let stats: Awaited<ReturnType<typeof stat>> | null = null;
        try {
            stats = await stat(asset);
            if (!stats.isFile()) return new Response('Not Found', { status: 404 });
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                const fallback = await chooseVariantFallbackFilename(
                    requestedFilename,
                    accessContext
                );
                if (!fallback) return new Response('Not Found', { status: 404 });
                resolvedFilename = fallback;
                asset = join(ASSET_DIR, resolvedFilename);
                try {
                    stats = await stat(asset);
                    if (!stats.isFile()) return new Response('Not Found', { status: 404 });
                } catch (fallbackError: any) {
                    if (fallbackError.code === 'ENOENT')
                        return new Response('Not Found', { status: 404 });
                    console.error('File system fallback error:', fallbackError);
                    return new Response('Internal Server Error', { status: 500 });
                }
            } else {
                console.error('File system error:', error);
                return new Response('Internal Server Error', { status: 500 });
            }
        }

        // The upload endpoint guarantees unique filename so we use it as ETag
        const etag = `"${resolvedFilename}"`;

        // If the browser already has this exact file, short circuit here
        if (ifNoneMatch === etag) {
            return new Response(null, {
                status: 304,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    ETag: etag,
                    'Cache-Control': 'public, max-age=31536000, immutable'
                }
            });
        }

        if (!stats) return new Response('Internal Server Error', { status: 500 });

        const fileSize = stats.size;
        const ext = extname(asset).toLowerCase();
        const contentType = ASSET_MIME_TYPES[ext] || 'application/octet-stream';

        // Set long life for downloaded assets here
        const baseHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': contentType,
            ETag: etag,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Accept-Ranges': 'bytes'
        };

        // If the client asks only for a range we optimise here
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

            if (start >= fileSize || end >= fileSize) {
                return new Response('Requested range not satisfiable', {
                    status: 416,
                    headers: { 'Content-Range': `bytes */${fileSize}` }
                });
            }

            const chunkSize = end - start + 1;
            const nodeStream = createReadStream(asset, { start, end });
            const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

            return new Response(webStream, {
                status: 206,
                headers: {
                    ...baseHeaders,
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Content-Length': chunkSize.toString()
                }
            });
        }

        const nodeStream = createReadStream(asset);
        const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

        return new Response(webStream, {
            status: 200,
            headers: {
                ...baseHeaders,
                'Content-Length': fileSize.toString()
            }
        });
    }
);

export const Route = createFileRoute('/api/assets/$uri')({
    server: {
        handlers: {
            GET: async ({ request, params }) => {
                const { uri } = params ?? {};
                const range = request.headers.get('range');
                const ifNoneMatch = request.headers.get('if-none-match');
                const session = await auth.api.getSession({
                    headers: request.headers
                });
                const userEmail = session?.user?.email ?? null;

                return getResponse({ uri, range, ifNoneMatch, userEmail });
            }
        }
    }
});
