import { z } from 'zod';

const oid = z.string();

export const AssetSchema = z.object({
    _id: oid,
    projectId: oid,
    name: z.string(),
    url: z.url(),
    size: z.number(),
    mimeType: z.string().optional(),
    blurhash: z.string().optional(),
    previewUrl: z.string().optional(),
    createdAt: z.iso.datetime(),
    createdBy: z.string()
});
export type Asset = z.infer<typeof AssetSchema>;

export const CreateAssetInput = z.object({
    projectId: oid,
    name: z.string(),
    url: z.url(),
    size: z.number(),
    mimeType: z.string().optional(),
    blurhash: z.string().optional(),
    previewUrl: z.string().optional()
});
export type CreateAssetInput = z.infer<typeof CreateAssetInput>;
