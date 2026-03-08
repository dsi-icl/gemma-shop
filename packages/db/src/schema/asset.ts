import { z } from 'zod';

const oid = z.string();

export const AssetSchema = z.object({
    _id: oid,
    projectId: oid,
    name: z.string(),
    url: z.string().url(),
    size: z.number(),
    createdAt: z.iso.datetime(),
    createdBy: z.string()
});
export type Asset = z.infer<typeof AssetSchema>;

export const CreateAssetInput = z.object({
    projectId: oid,
    name: z.string(),
    url: z.string().url(),
    size: z.number()
});
export type CreateAssetInput = z.infer<typeof CreateAssetInput>;
