import { ObjectId } from 'mongodb';

import { dbCol } from '~/server/collections';
import { serializeForClient } from '~/server/serialization';

export type AuditOutcome = 'success' | 'denied' | 'failure' | 'error';

export interface AuditLogInput {
    action: string;
    actorId?: string | null;
    projectId?: string | ObjectId | null;
    resourceType?: string | null;
    resourceId?: string | null;
    outcome?: AuditOutcome;
    reasonCode?: string | null;
    changes?: Record<string, unknown> | null;
    error?: string | null;
}

function toObjectIdOrNull(value: string | ObjectId | null | undefined): ObjectId | null {
    if (!value) return null;
    if (value instanceof ObjectId) return value;
    return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

export async function logAudit(input: AuditLogInput): Promise<void> {
    try {
        const projectId = toObjectIdOrNull(input.projectId);
        await dbCol.auditLogs.insertLog({
            projectId,
            actorId: input.actorId ?? null,
            action: input.action,
            outcome: input.outcome ?? 'success',
            resourceType: input.resourceType ?? null,
            resourceId: input.resourceId ?? null,
            reasonCode: input.reasonCode ?? null,
            changes: input.changes ? serializeForClient(input.changes) : null,
            error: input.error ?? null
        });
    } catch (error) {
        // Audit logging must not break business flows.
        console.error('[Audit] Failed to write audit log:', error);
    }
}

export async function logAuditSuccess(input: Omit<AuditLogInput, 'outcome'>): Promise<void> {
    await logAudit({ ...input, outcome: 'success' });
}

export async function logAuditDenied(input: Omit<AuditLogInput, 'outcome'>): Promise<void> {
    await logAudit({ ...input, outcome: 'denied' });
}

export async function logAuditFailure(input: Omit<AuditLogInput, 'outcome'>): Promise<void> {
    await logAudit({ ...input, outcome: 'failure' });
}

export async function logAuditError(input: Omit<AuditLogInput, 'outcome'>): Promise<void> {
    await logAudit({ ...input, outcome: 'error' });
}
