import { execSync } from 'node:child_process';

import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig, loadEnv } from 'vite';
import mkcert from 'vite-plugin-mkcert';

import { thirdPartyNoticesPlugin } from './plugins/thirdPartyNotices';
import { ttfPlugin } from './plugins/ttf';

const shouldEnableSourceMaps = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.BUILD_SOURCEMAPS ?? '').toLowerCase()
);

function resolveBuildCommitSha(): string {
    const fromEnv = process.env.VITE_GIT_SHA?.trim();
    if (fromEnv) return fromEnv;
    try {
        return execSync('git rev-parse --short=8 HEAD').toString().trim();
    } catch {
        return 'unknown';
    }
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const isHttps = env.VITE_HTTPS === 'true';
    const buildCommitSha = resolveBuildCommitSha();
    const buildTimestamp = new Date().toISOString();

    return {
        define: {
            __APP_COMMIT_SHA__: JSON.stringify(buildCommitSha),
            __APP_BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp)
        },
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
            allowedHosts: ['localhost', '127.0.0.1']
            // https: isHttps ? {} : undefined
        },
        css: {
            transformer: 'lightningcss',
            lightningcss: {
                cssModules: true
            }
        },
        plugins: [
            isHttps
                ? mkcert({
                      keyFileName: 'gemma-shop-dev-key.pem',
                      certFileName: 'gemma-shop-dev-cert.pem'
                  })
                : undefined,
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
            viteReact(),
            // https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md#react-compiler
            babel({
                presets: [
                    reactCompilerPreset({
                        target: '19'
                    })
                ]
            }),
            tailwindcss()
        ]
    };
});
