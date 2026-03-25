import { adminMiddleware } from '@repo/auth/tanstack/middleware';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import {
    adminDeletePublicAsset,
    adminListConfig,
    adminGetWallBindingMeta,
    adminGetStats,
    adminListProjects,
    adminListPublicAssets,
    adminListUsers,
    adminListWalls,
    adminSendSmtpTest,
    adminSetConfig,
    adminUnbindWall
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
    .handler(async ({ data, context }) => adminDeletePublicAsset(data.id, context.user.email));

export const $adminUnbindWall = createServerFn({ method: 'POST' })
    .middleware([adminMiddleware])
    .inputValidator(z.object({ wallId: z.string() }))
    .handler(async ({ data }) => adminUnbindWall(data.wallId));

export const $adminGetUploadToken = createServerFn({ method: 'POST' })
    .middleware([adminMiddleware])
    .handler(async ({ context }) => {
        const { createUploadToken } = await import('~/lib/uploadTokens');
        const { PUBLIC_ASSET_PROJECT_ID } = await import('~/lib/constants');
        return createUploadToken(PUBLIC_ASSET_PROJECT_ID, context.user.email);
    });

export const $adminGetWallBindingMeta = createServerFn({ method: 'GET' })
    .middleware([adminMiddleware])
    .inputValidator(
        z.object({
            boundProjectId: z.string().nullable().optional(),
            boundCommitId: z.string().nullable().optional(),
            boundSlideId: z.string().nullable().optional()
        })
    )
    .handler(async ({ data }) =>
        adminGetWallBindingMeta({
            boundProjectId: data.boundProjectId ?? null,
            boundCommitId: data.boundCommitId ?? null,
            boundSlideId: data.boundSlideId ?? null
        })
    );

export const $adminListConfig = createServerFn({ method: 'GET' })
    .middleware([adminMiddleware])
    .handler(async () => adminListConfig());

export const $adminSetConfig = createServerFn({ method: 'POST' })
    .middleware([adminMiddleware])
    .inputValidator(
        z.object({
            key: z.string(),
            value: z.string()
        })
    )
    .handler(async ({ data, context }) =>
        adminSetConfig({ key: data.key, value: data.value, updatedBy: context.user.email })
    );

export const $adminSendSmtpTest = createServerFn({ method: 'POST' })
    .middleware([adminMiddleware])
    .inputValidator(z.object({ to: z.string().email() }))
    .handler(async ({ data }) => adminSendSmtpTest({ to: data.to }));
