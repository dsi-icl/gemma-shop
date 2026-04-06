import type { PublicDoc } from '@repo/db/collections';
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

export function serializeAudit(doc: PublicDoc<AuditLogDocument>): SerializedAuditLog {
    return {
        id: doc.id,
        projectId: toIdString(doc.projectId),
        actorId: toScalarString(doc.actorId),
        action: toScalarString(doc.action),
        // changes is Record<string, unknown> — may contain ObjectIds or Dates from old data
        changes: doc.changes
            ? (serializeForClient(doc.changes) as SerializedAuditLog['changes'])
            : null,
        createdAt: epochToISO(doc.createdAt)
    };
}
