import { z } from 'zod';

const oid = z.string();

export const YDocsSchema = z.object({
    _id: oid,
    scope: z.string(),
    data: z.any(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime()
});

export type YDocs = z.infer<typeof YDocsSchema>;
