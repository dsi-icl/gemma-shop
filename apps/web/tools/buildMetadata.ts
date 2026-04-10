import { execSync } from 'node:child_process';

const COMMIT_ENV_KEYS = [
    'VITE_GIT_SHA',
    'APP_COMMIT_SHA',
    'GIT_COMMIT',
    'GITHUB_SHA',
    'GITHUB_HEAD_SHA',
    'CI_COMMIT_SHA',
    'CI_COMMIT_SHORT_SHA',
    'BUILD_SOURCEVERSION',
    'BUILDKITE_COMMIT',
    'CIRCLE_SHA1',
    'DRONE_COMMIT_SHA',
    'BITBUCKET_COMMIT',
    'VERCEL_GIT_COMMIT_SHA',
    'CF_PAGES_COMMIT_SHA',
    'TRAVIS_COMMIT',
    'SOURCE_VERSION',
    'CODEBUILD_RESOLVED_SOURCE_VERSION',
    'BITRISE_GIT_COMMIT',
    'RENDER_GIT_COMMIT',
    'HEROKU_TEST_RUN_COMMIT_VERSION'
] as const;

function normalizeCommitSha(value: string | undefined | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const directMatch = trimmed.match(/^[0-9a-f]{7,40}$/i);
    if (directMatch) return trimmed.slice(0, 8).toLowerCase();

    const embeddedMatch = trimmed.match(/[0-9a-f]{7,40}/i);
    if (embeddedMatch) return embeddedMatch[0].slice(0, 8).toLowerCase();

    return null;
}

function mergedEnv(
    extraEnv?: Record<string, string | undefined>
): Record<string, string | undefined> {
    return {
        ...Object.fromEntries(
            Object.entries(process.env).map(([k, v]) => [k, typeof v === 'string' ? v : undefined])
        ),
        ...(extraEnv ?? {})
    };
}

function resolveGitHeadShortSha(): string | null {
    try {
        const fromGit = execSync('git rev-parse HEAD', {
            stdio: ['ignore', 'pipe', 'ignore']
        })
            .toString()
            .trim();
        return normalizeCommitSha(fromGit);
    } catch {
        return null;
    }
}

export function resolveBuildCommitSha(extraEnv?: Record<string, string | undefined>): string {
    const env = mergedEnv(extraEnv);
    for (const key of COMMIT_ENV_KEYS) {
        const normalized = normalizeCommitSha(env[key]);
        if (normalized) return normalized;
    }
    return resolveGitHeadShortSha() ?? 'unknown';
}

export function resolveBuildMetadata(extraEnv?: Record<string, string | undefined>) {
    return {
        commitSha: resolveBuildCommitSha(extraEnv),
        timestamp: new Date().toISOString()
    } as const;
}
