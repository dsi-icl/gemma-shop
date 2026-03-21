import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

import { ttfPlugin } from './plugins/ttf';

export default defineConfig({
    resolve: {
        tsconfigPaths: true
    },
    server: {
        host: '0.0.0.0',
        port: 3670,
        allowedHosts: ['localhost', '127.0.0.1']
    },
    plugins: [
        ttfPlugin(),
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
