import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

import type { Plugin } from 'vite';

type PackageNotice = {
    name: string;
    version: string;
    license: string;
    repository: string | null;
    homepage: string | null;
    author: string | null;
    licenseFiles: string[];
    licenseText: string | null;
};

const require = createRequire(import.meta.url);

function normalizeModuleId(id: string): string {
    const noQuery = id.split('?')[0];
    return noQuery.split('\0').join('');
}

function packageNameFromModuleId(id: string): string | null {
    const normalized = normalizeModuleId(id);
    const parts = normalized.split(/[\\/]+/).filter(Boolean);
    const lastNodeModules = parts.lastIndexOf('node_modules');
    if (lastNodeModules < 0 || lastNodeModules + 1 >= parts.length) return null;

    const first = parts[lastNodeModules + 1];
    if (!first) return null;
    if (first.startsWith('@') && lastNodeModules + 2 < parts.length) {
        return `${first}/${parts[lastNodeModules + 2]}`;
    }
    return first;
}

function extractRepositoryUrl(repo: unknown): string | null {
    if (typeof repo === 'string') return repo;
    if (repo && typeof repo === 'object' && 'url' in repo) {
        const maybe = (repo as { url?: unknown }).url;
        return typeof maybe === 'string' ? maybe : null;
    }
    return null;
}

function extractAuthor(author: unknown): string | null {
    if (typeof author === 'string') return author;
    if (author && typeof author === 'object' && 'name' in author) {
        const maybe = (author as { name?: unknown }).name;
        return typeof maybe === 'string' ? maybe : null;
    }
    return null;
}

function extractLicense(license: unknown): string {
    if (typeof license === 'string') return license;
    if (license && typeof license === 'object' && 'type' in license) {
        const maybe = (license as { type?: unknown }).type;
        return typeof maybe === 'string' ? maybe : 'UNKNOWN';
    }
    return 'UNKNOWN';
}

async function readLicenseFiles(packageDir: string): Promise<{
    files: string[];
    text: string | null;
}> {
    const entries = await fs.readdir(packageDir, { withFileTypes: true });
    const candidates = entries
        .filter(
            (entry) =>
                entry.isFile() &&
                /^(license|licence|copying|notice)([-_.].+)?(\..+)?$/i.test(entry.name)
        )
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));

    if (candidates.length === 0) {
        return { files: [], text: null };
    }

    const texts = await Promise.all(
        candidates.map(async (file) => {
            const fullPath = `${packageDir}/${file}`;
            try {
                const content = await fs.readFile(fullPath, 'utf8');
                return { file, content };
            } catch {
                return { file, content: '' };
            }
        })
    );

    const merged = texts
        .filter((item) => item.content.trim().length > 0)
        .map((item) => `--- ${item.file} ---\n${item.content.trim()}`)
        .join('\n\n');

    return { files: candidates, text: merged.length > 0 ? merged : null };
}

async function resolvePackageNotice(packageName: string): Promise<PackageNotice | null> {
    let packageJsonPath: string;
    try {
        packageJsonPath = require.resolve(`${packageName}/package.json`, {
            paths: [process.cwd()]
        });
    } catch {
        return null;
    }

    const pkgRaw = await fs.readFile(packageJsonPath, 'utf8');
    const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
    const packageDir = dirname(packageJsonPath);
    const { files, text } = await readLicenseFiles(packageDir);

    const name = typeof pkg.name === 'string' ? pkg.name : packageName;
    const version = typeof pkg.version === 'string' ? pkg.version : '0.0.0';

    return {
        name,
        version,
        license: extractLicense(pkg.license),
        repository: extractRepositoryUrl(pkg.repository),
        homepage: typeof pkg.homepage === 'string' ? pkg.homepage : null,
        author: extractAuthor(pkg.author),
        licenseFiles: files,
        licenseText: text
    };
}

function toNoticesText(packages: PackageNotice[], generatedAt: string): string {
    const header = [
        'THIRD-PARTY NOTICES',
        '',
        `Generated at: ${generatedAt}`,
        `Packages: ${packages.length}`,
        '',
        'This file is generated from tree-shaken modules used by the production bundle.'
    ].join('\n');

    const blocks = packages.map((pkg) => {
        const meta = [
            `Package: ${pkg.name}`,
            `Version: ${pkg.version}`,
            `License: ${pkg.license}`,
            `Repository: ${pkg.repository ?? 'N/A'}`,
            `Homepage: ${pkg.homepage ?? 'N/A'}`,
            `Author: ${pkg.author ?? 'N/A'}`,
            `License files: ${pkg.licenseFiles.length > 0 ? pkg.licenseFiles.join(', ') : 'N/A'}`
        ].join('\n');

        const body = pkg.licenseText ?? 'License text not found in package files.';
        return [meta, '', body].join('\n');
    });

    return `${header}\n\n${blocks.join('\n\n========================================\n\n')}\n`;
}

export function thirdPartyNoticesPlugin(): Plugin {
    let isSsrBuild = false;

    return {
        name: 'third-party-notices',
        apply: 'build',
        configResolved(config) {
            isSsrBuild = Boolean(config.build.ssr);
        },
        async generateBundle(_options, bundle) {
            if (isSsrBuild) return;

            const packageNames = new Set<string>();

            for (const item of Object.values(bundle as Record<string, unknown>)) {
                if (!item || typeof item !== 'object') continue;
                if (!('type' in item) || item.type !== 'chunk') continue;
                if (!('modules' in item) || !item.modules || typeof item.modules !== 'object') {
                    continue;
                }

                for (const moduleId of Object.keys(item.modules as Record<string, unknown>)) {
                    if (!moduleId.includes('node_modules')) continue;
                    const packageName = packageNameFromModuleId(moduleId);
                    if (packageName) packageNames.add(packageName);
                }
            }

            const resolved = (
                await Promise.all(
                    Array.from(packageNames)
                        .sort((a, b) => a.localeCompare(b))
                        .map((name) => resolvePackageNotice(name))
                )
            ).filter((entry): entry is PackageNotice => entry !== null);

            const generatedAt = new Date().toISOString();
            const jsonPayload = {
                generatedAt,
                packageCount: resolved.length,
                packages: resolved
            };

            this.emitFile({
                type: 'asset',
                fileName: 'third-party-notices.json',
                source: JSON.stringify(jsonPayload, null, 2)
            });

            this.emitFile({
                type: 'asset',
                fileName: 'THIRD_PARTY_NOTICES.txt',
                source: toNoticesText(resolved, generatedAt)
            });
        }
    };
}
