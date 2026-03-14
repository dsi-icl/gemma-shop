import { z } from 'zod';

const oid = z.string();

export const WallSchema = z.object({
    _id: oid,
    wallId: z.string(),
    name: z.string(),
    connectedNodes: z.number().default(0),
    lastSeen: z.iso.datetime(),
    boundProjectId: oid.optional(),
    boundSlideId: z.string().optional(),
    createdAt: z.iso.datetime()
});

export type Wall = z.infer<typeof WallSchema>;
