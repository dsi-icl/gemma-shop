import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { basename, join, extname } from 'path';

import { createFileRoute } from '@tanstack/react-router';
import { createServerOnlyFn } from '@tanstack/react-start';

import { ASSET_DIR } from '~/lib/serverVariables';

const MIME_TYPES: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
};

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
        const safeFilename = basename(decodeURIComponent(uri));

        // The upload endpoint guarantees unique filename so we use it as ETag
        const etag = `"${safeFilename}"`;

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

        // If we get here, it's a new request. Now we hit the disk.
        const asset = join(ASSET_DIR, safeFilename);

        let stats;
        try {
            stats = await stat(asset);
            if (!stats.isFile()) return new Response('Not Found', { status: 404 });
        } catch (error: any) {
            if (error.code === 'ENOENT') return new Response('Not Found', { status: 404 });
            console.error('File system error:', error);
            return new Response('Internal Server Error', { status: 500 });
        }

        const fileSize = stats.size;
        const ext = extname(asset).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

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
