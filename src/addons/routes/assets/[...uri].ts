import { readFile, exists } from 'fs/promises';
import { basename, join } from 'path';

import { defineHandler } from 'nitro/h3';

import { ASSET_DIR } from '@/lib/serverVariables';

export default defineHandler<{ routerParams: { uri: string } }>(async (event) => {
    const { params } = event.context;
    const { uri } = params ?? {};
    const safeFilename = basename(decodeURIComponent(uri));
    const asset = join(ASSET_DIR, safeFilename);
    if (await exists(asset)) {
        return new Response(await readFile(asset), {
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }
    return new Response('Not Found', { status: 404 });
});
