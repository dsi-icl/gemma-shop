import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const config = defineConfig({
    resolve: { tsconfigPaths: true },
    plugins: [
        nitro({
            serverDir: './src/addons',
            // preset: 'bun',
            features: { websocket: true },
            serveStatic: true,
            ssrRoutes: []
        }),
        devtools(),
        tsconfigPaths({ projects: ['./tsconfig.json'] }),
        tailwindcss(),
        tanstackStart({ spa: { enabled: false } }),
        viteReact({ babel: { plugins: ['babel-plugin-react-compiler'] } })
    ]
});

export default config;
