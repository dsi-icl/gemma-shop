import { z } from 'zod';

const oid = z.string();

export const WallSchema = z.object({
    _id: oid,
    _schemaVersion: z.number().int().nonnegative().optional(),
    wallId: z.string(),
    name: z.string(),
    connectedNodes: z.number().default(0),
    lastSeen: z.iso.datetime(),
    boundProjectId: oid.nullish(),
    boundSlideId: z.string().nullish(),
    createdAt: z.iso.datetime()
});

export type Wall = z.infer<typeof WallSchema>;
