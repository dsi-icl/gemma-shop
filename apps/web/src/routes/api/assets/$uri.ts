import { readFile, stat } from 'node:fs/promises';
import { basename, join } from 'path';

import { createFileRoute } from '@tanstack/react-router';
import { createServerOnlyFn } from '@tanstack/react-start';

import { ASSET_DIR } from '~/lib/serverVariables';

const getResponse = createServerOnlyFn(async (uri: string) => {
    const safeFilename = basename(decodeURIComponent(uri));
    const asset = join(ASSET_DIR, safeFilename);
    if ((await stat(asset)).isFile()) {
        return new Response(await readFile(asset), {
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }
    return new Response('Not Found', { status: 404 });
});

export const Route = createFileRoute('/api/assets/$uri')({
    server: {
        handlers: {
            GET: async ({ params }) => {
                const { uri } = params ?? {};
                return getResponse(uri);
            }
        }
    }
});
