import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { basename, join, extname } from 'path';

import { createFileRoute } from '@tanstack/react-router';
import { createServerOnlyFn } from '@tanstack/react-start';

import { ASSET_MIME_TYPES } from '~/lib/assetMime';
import { ASSET_DIR } from '~/lib/serverVariables';
import { collections } from '~/server/collections';

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

async function chooseVariantFallbackFilename(requestedFilename: string): Promise<string | null> {
    const parsed = parseVariantFilename(requestedFilename);
    if (!parsed) return null;

    const { baseId, requested } = parsed;
    const escapedBase = escapeRegex(baseId);

    const assetMeta = (await collections.assets.findOne(
        {
            $or: [
                { url: { $regex: `^${escapedBase}\\.[^.]+$`, $options: 'i' } },
                { previewUrl: { $regex: `^${escapedBase}\\.[^.]+$`, $options: 'i' } }
            ]
        },
        { projection: { url: 1, previewUrl: 1, sizes: 1 } }
    )) as { url?: string; previewUrl?: string; sizes?: unknown[] } | null;
    if (!assetMeta) return null;

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
        const candidate = `${baseId}_${size}.webp`;
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

const getResponse = createServerOnlyFn(
    async ({
        uri,
        range,
        ifNoneMatch
    }: {
        uri: string;
        range: string | null;
        ifNoneMatch: string | null;
    }) => {
        const requestedFilename = basename(decodeURIComponent(uri));
        let resolvedFilename = requestedFilename;
        let asset = join(ASSET_DIR, resolvedFilename);

        let stats: Awaited<ReturnType<typeof stat>> | null = null;
        try {
            stats = await stat(asset);
            if (!stats.isFile()) return new Response('Not Found', { status: 404 });
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                const fallback = await chooseVariantFallbackFilename(requestedFilename);
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

                return getResponse({ uri, range, ifNoneMatch });
            }
        }
    }
});
