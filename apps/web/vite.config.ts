import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteBasicSsl from '@vitejs/plugin-basic-ssl';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

import { thirdPartyNoticesPlugin } from './plugins/thirdPartyNotices';
import { ttfPlugin } from './plugins/ttf';

const shouldEnableSourceMaps = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.BUILD_SOURCEMAPS ?? '').toLowerCase()
);

export default defineConfig({
    build: {
        sourcemap: shouldEnableSourceMaps,
        rollupOptions: {
            // Keep Playwright out of bundled server chunks. It is a runtime-only dependency
            // for the screenshot endpoint and may reference deep optional modules.
            external: ['playwright', 'playwright-core', 'chromium-bidi']
        }
    },
    resolve: {
        tsconfigPaths: true
    },
    server: {
        host: '0.0.0.0',
        port: 3670,
        allowedHosts: ['localhost', '127.0.0.1'],
        https: {}
    },
    plugins: [
        viteBasicSsl({
            domains: ['gemma.shop.127.0.0.1.nip.io']
        }),
        ttfPlugin(),
        thirdPartyNoticesPlugin(),
        devtools({
            // Avoid runtime console serialization loops in complex React/Nitro error paths.
            // Keeps devtools available while disabling the console-pipe injection.
            consolePiping: { enabled: false }
        }),
        tanstackStart(),
        // https://tanstack.com/start/latest/docs/framework/react/guide/hosting
        nitro({
            serverDir: './src/addons',
            features: { websocket: true }
        }),
        viteReact({
            // https://react.dev/learn/react-compiler
            babel: {
                plugins: [
                    [
                        'babel-plugin-react-compiler',
                        {
                            target: '19'
                        }
                    ]
                ]
            }
        }),
        tailwindcss()
    ]
});
