import { z } from 'zod';

const oid = z.string();

export const AssetSchema = z.object({
    _id: oid,
    _schemaVersion: z.number().int().nonnegative().optional(),
    projectId: oid,
    name: z.string(),
    url: z.string(),
    size: z.number(),
    mimeType: z.string().nullish(),
    blurhash: z.string().nullish(),
    previewUrl: z.string().nullish(),
    sizes: z.array(z.number()).nullish(),
    public: z.boolean().nullish().default(false),
    deletedAt: z.iso.datetime().nullish(),
    deletedBy: z.string().nullish(),
    createdAt: z.iso.datetime(),
    createdBy: z.string()
});
export type Asset = z.infer<typeof AssetSchema>;

export const CreateAssetInput = z.object({
    projectId: oid,
    name: z.string(),
    url: z.string(),
    size: z.number(),
    mimeType: z.string().optional(),
    blurhash: z.string().optional(),
    previewUrl: z.string().optional(),
    sizes: z.array(z.number()).optional(),
    public: z.boolean().optional().default(false)
});
export type CreateAssetInput = z.infer<typeof CreateAssetInput>;
