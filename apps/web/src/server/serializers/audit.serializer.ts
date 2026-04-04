import type { AuditLogDocument } from '@repo/db/documents';

import { epochToISO, serializeForClient, toIdString, toScalarString } from '~/server/serialization';

export interface SerializedAuditLog {
    id: string;
    projectId: string;
    actorId: string;
    action: string;
    changes: Record<string, string | number | boolean | null> | null;
    createdAt: string;
}

export function serializeAudit(doc: AuditLogDocument): SerializedAuditLog {
    return serializeForClient({
        id: doc.id,
        projectId: toIdString(doc.projectId),
        actorId: toScalarString(doc.actorId),
        action: toScalarString(doc.action),
        changes:
            (doc.changes
                ? (serializeForClient(doc.changes) as SerializedAuditLog['changes'])
                : null) ?? null,
        createdAt: epochToISO(doc.createdAt)
    });
}
