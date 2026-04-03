import type { AuditLogDocument } from '@repo/db/documents';

import { serializeForClient, toScalarString, toIdString } from '~/server/serialization';

export interface SerializedAuditLog {
    _id: string;
    projectId: string;
    actorId: string;
    action: string;
    changes: Record<string, string | number | boolean | null> | null;
    createdAt: string;
}

export function serializeAudit(doc: AuditLogDocument): SerializedAuditLog {
    return serializeForClient({
        _id: toIdString(doc._id),
        projectId: toIdString(doc.projectId),
        actorId: toScalarString(doc.actorId),
        action: toScalarString(doc.action),
        changes:
            (doc.changes
                ? (serializeForClient(doc.changes) as SerializedAuditLog['changes'])
                : null) ?? null,
        createdAt:
            doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt)
    });
}
