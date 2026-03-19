import { adminMiddleware } from '@repo/auth/tanstack/middleware';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import {
    adminDeletePublicAsset,
    adminGetStats,
    adminListProjects,
    adminListPublicAssets,
    adminListUsers,
    adminListWalls
} from './admin';

export const $adminListUsers = createServerFn({ method: 'GET' })
    .middleware([adminMiddleware])
    .handler(async () => adminListUsers());

export const $adminListProjects = createServerFn({ method: 'GET' })
    .middleware([adminMiddleware])
    .handler(async () => adminListProjects());

export const $adminGetStats = createServerFn({ method: 'GET' })
    .middleware([adminMiddleware])
    .handler(async () => adminGetStats());

export const $adminListWalls = createServerFn({ method: 'GET' })
    .middleware([adminMiddleware])
    .handler(async () => adminListWalls());

export const $adminListPublicAssets = createServerFn({ method: 'GET' })
    .middleware([adminMiddleware])
    .handler(async () => adminListPublicAssets());

export const $adminDeletePublicAsset = createServerFn({ method: 'POST' })
    .middleware([adminMiddleware])
    .inputValidator(z.object({ id: z.string() }))
    .handler(async ({ data }) => adminDeletePublicAsset(data.id));

export const $adminGetUploadToken = createServerFn({ method: 'POST' })
    .middleware([adminMiddleware])
    .handler(async ({ context }) => {
        const { createUploadToken } = await import('~/lib/uploadTokens');
        const { PUBLIC_ASSET_PROJECT_ID } = await import('~/lib/serverVariables');
        return createUploadToken(PUBLIC_ASSET_PROJECT_ID, context.user.email);
    });
