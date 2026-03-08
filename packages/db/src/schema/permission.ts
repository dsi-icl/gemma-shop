// Client-side can't use the actual type
import { ObjectId } from 'mongodb';
import { z } from 'zod';
const oid = z.union([z.string(), z.instanceof(ObjectId)]).transform((v) => new ObjectId(v));

// const oid = z.string()
export const PermissionSchema = z.object({
    _id: oid.optional(),
    projectId: oid,
    userId: oid,
    role: z.enum(['owner', 'editor', 'viewer']),
    grantedBy: oid,
    grantedAt: z.date().default(() => new Date())
});
