// Client-side can't use the actual type
import { ObjectId } from 'mongodb';
import { z } from 'zod';
const oid = z.union([z.string(), z.instanceof(ObjectId)]).transform((v) => new ObjectId(v));

// const oid = z.string()
export const AuditLogSchema = z.object({
    _id: oid.optional(),
    _schemaVersion: z.number().int().nonnegative().optional(),
    projectId: oid,
    actorId: oid,
    action: z.enum(['PROJECT_UPDATED', 'PERMISSION_GRANTED', 'PERMISSION_REVOKED']),
    changes: z.any(), // e.g., { previousRole: 'viewer', newRole: 'editor' }
    createdAt: z.date().default(() => new Date())
});
