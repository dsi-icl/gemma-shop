import { readFileSync } from 'node:fs';

import type { PluginOption } from 'vite';

export const ttfPlugin = (): PluginOption => {
    return {
        name: 'import-ttf-as-hex',
        transform(_code, id) {
            const [path, query] = id.split('?');
            if (query != 'raw-hex') return null;

            const data = readFileSync(path);
            const hex = data.toString('hex');

            return `export const src = '${hex}'; export default src;`;
        }
    };
};
