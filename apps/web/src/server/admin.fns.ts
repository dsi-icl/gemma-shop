import { adminMiddleware } from '@repo/auth/tanstack/middleware';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import {
    adminCreateWall,
    adminDeleteWall,
    adminDevicesEnrollBySignature,
    adminDeleteDevice,
    adminDevicesList,
    adminGetWall,
    adminListDevicesForWall,
    adminDeletePublicAsset,
    adminListConfig,
    adminGetWallBindingMeta,
    adminGetStats,
    adminListProjects,
    adminListPublicAssets,
    adminListUsers,
    adminListWalls,
    adminSetUserBanStatus,
    adminSendSmtpTest,
    adminSetConfig,
    adminUpdateWallMetadata,
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

export const $adminCreateWall = createServerFn({ method: 'POST' })
    .middleware([adminMiddleware])
    .inputValidator(z.object({ wallId: z.string(), name: z.string().optional().nullable() }))
    .handler(async ({ data }) => adminCreateWall({ wallId: data.wallId, name: data.name ?? null }));

export const $adminGetWall = createServerFn({ method: 'GET' })
    .middleware([adminMiddleware])
    .inputValidator(z.object({ wallId: z.string() }))
    .handler(async ({ data }) => adminGetWall(data.wallId));

export const $adminUpdateWallMetadata = createServerFn({ method: 'POST' })
    .middleware([adminMiddleware])
    .inputValidator(
        z.object({
            wallId: z.string(),
            name: z.string().optional().nullable(),
            site: z.string().optional().nullable(),
            notes: z.string().optional().nullable()
        })
    )
    .handler(async ({ data }) =>
        adminUpdateWallMetadata({
            wallId: data.wallId,
            name: data.name ?? null,
            site: data.site ?? null,
            notes: data.notes ?? null
        })
    );

export const $adminDeleteWall = createServerFn({ method: 'POST' })
    .middleware([adminMiddleware])
    .inputValidator(z.object({ wallId: z.string() }))
    .handler(async ({ data }) => adminDeleteWall(data.wallId));

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
    .inputValidator(z.object({ to: z.email() }))
    .handler(async ({ data }) => adminSendSmtpTest({ to: data.to }));

export const $adminDevicesList = createServerFn({ method: 'GET' })
    .middleware([adminMiddleware])
    .handler(async () => adminDevicesList());

export const $adminDevicesForWall = createServerFn({ method: 'GET' })
    .middleware([adminMiddleware])
    .inputValidator(z.object({ wallId: z.string() }))
    .handler(async ({ data }) => adminListDevicesForWall(data.wallId));

export const $adminDevicesEnrollBySignature = createServerFn({ method: 'POST' })
    .middleware([adminMiddleware])
    .inputValidator(
        z.object({
            deviceId: z.string(),
            signature: z.string(),
            kind: z.enum(['wall', 'gallery', 'controller']),
            wallId: z.string()
        })
    )
    .handler(async ({ data, context }) =>
        adminDevicesEnrollBySignature({
            deviceId: data.deviceId,
            signature: data.signature,
            kind: data.kind,
            wallId: data.wallId,
            assignedBy: context.user.email
        })
    );

export const $adminDeleteDevice = createServerFn({ method: 'POST' })
    .middleware([adminMiddleware])
    .inputValidator(
        z.object({
            deviceId: z.string()
        })
    )
    .handler(async ({ data, context }) =>
        adminDeleteDevice({
            deviceId: data.deviceId,
            deletedBy: context.user.email
        })
    );

export const $adminSetUserBanStatus = createServerFn({ method: 'POST' })
    .middleware([adminMiddleware])
    .inputValidator(
        z.object({
            userId: z.string(),
            banned: z.boolean()
        })
    )
    .handler(async ({ data, context }) =>
        adminSetUserBanStatus({
            userId: data.userId,
            banned: data.banned,
            actorEmail: context.user.email
        })
    );
