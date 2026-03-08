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
        port: 3670
    },
    plugins: [
        ttfPlugin(),
        devtools(),
        tanstackStart(),
        // https://tanstack.com/start/latest/docs/framework/react/guide/hosting
        nitro(),
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
