import type { JsonValue } from '@repo/db/documents';

import { dbCol } from '~/server/collections';

export type AuditOutcome = 'success' | 'denied' | 'failure' | 'error';

export interface AuditLogInput {
    action: string;
    actorId?: string | null;
    projectId?: string | null;
    resourceType?: string | null;
    resourceId?: string | null;
    outcome?: AuditOutcome;
    reasonCode?: string | null;
    changes?: { [key: string]: JsonValue } | null;
    error?: string | null;
}

export async function logAudit(input: AuditLogInput): Promise<void> {
    try {
        await dbCol.auditLogs.insertLog({
            projectId: input.projectId ?? null,
            actorId: input.actorId ?? null,
            action: input.action,
            outcome: input.outcome ?? 'success',
            resourceType: input.resourceType ?? null,
            resourceId: input.resourceId ?? null,
            reasonCode: input.reasonCode ?? null,
            changes: input.changes ?? null,
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
