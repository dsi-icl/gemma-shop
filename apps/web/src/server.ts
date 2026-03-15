import { mkdirSync } from 'node:fs';

import handler, { createServerEntry } from '@tanstack/react-start/server-entry';

import { UPLOAD_DIR, TMP_DIR, ASSET_DIR } from '~/lib/serverVariables';

try {
    mkdirSync(UPLOAD_DIR, { recursive: true });
    mkdirSync(TMP_DIR, { recursive: true });
    mkdirSync(ASSET_DIR, { recursive: true });
} catch (err) {
    console.error('Asset management directory creation failed:', err);
    process.exit(1);
}

export default createServerEntry({
    fetch(request) {
        return handler.fetch(request);
    }
});
