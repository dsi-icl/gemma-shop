import { z } from 'zod';

const oid = z.string();

export const AssetSchema = z.object({
    _id: oid,
    projectId: oid,
    name: z.string(),
    url: z.string(),
    size: z.number(),
    mimeType: z.string().optional(),
    blurhash: z.string().optional(),
    previewUrl: z.string().optional(),
    sizes: z.array(z.number()).optional(),
    public: z.boolean().optional().default(false),
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
