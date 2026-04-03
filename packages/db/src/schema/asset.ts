import { z } from 'zod';

const oid = z.string();

// TODO Revise nullish() due to mongo so that coalescing is less verbose down the line
export const AssetSchema = z.object({
    _id: oid,
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
