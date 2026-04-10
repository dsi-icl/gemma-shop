import type { JsonValue } from '@repo/db/documents';
import { createFileRoute } from '@tanstack/react-router';

import { logAuditDenied } from '~/server/audit';

type CspReportEnvelope = {
    'csp-report'?: Record<string, unknown>;
};

type ReportingApiItem = {
    age?: number;
    body?: Record<string, unknown>;
    type?: string;
    url?: string;
    user_agent?: string;
};

type CspViolationSummary = {
    documentUri: string | null;
    violatedDirective: string | null;
    effectiveDirective: string | null;
    blockedUri: string | null;
    disposition: string | null;
    originalPolicy: string | null;
    sourceFile: string | null;
    lineNumber: number | null;
    columnNumber: number | null;
    statusCode: number | null;
    sample: string | null;
    referrer: string | null;
    reportType: string | null;
    reportUrl: string | null;
    userAgent: string | null;
};

function toRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
}

function firstString(input: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = input[key];
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed.length > 0) return trimmed;
        }
    }
    return null;
}

function firstNumber(input: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
        const value = input[key];
        if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return null;
}

function summarizeViolation(
    reportBody: Record<string, unknown>,
    meta?: { reportType?: string | null; reportUrl?: string | null; userAgent?: string | null }
): CspViolationSummary {
    return {
        documentUri: firstString(reportBody, ['document-uri', 'documentURL']),
        violatedDirective: firstString(reportBody, ['violated-directive', 'violatedDirective']),
        effectiveDirective: firstString(reportBody, ['effective-directive', 'effectiveDirective']),
        blockedUri: firstString(reportBody, ['blocked-uri', 'blockedURL']),
        disposition: firstString(reportBody, ['disposition']),
        originalPolicy: firstString(reportBody, ['original-policy', 'originalPolicy']),
        sourceFile: firstString(reportBody, ['source-file', 'sourceFile']),
        lineNumber: firstNumber(reportBody, ['line-number', 'lineNumber']),
        columnNumber: firstNumber(reportBody, ['column-number', 'columnNumber']),
        statusCode: firstNumber(reportBody, ['status-code', 'statusCode']),
        sample: firstString(reportBody, ['script-sample', 'sample']),
        referrer: firstString(reportBody, ['referrer']),
        reportType: meta?.reportType ?? null,
        reportUrl: meta?.reportUrl ?? null,
        userAgent: meta?.userAgent ?? null
    };
}

function toAuditChanges(summary: CspViolationSummary): { [key: string]: JsonValue } {
    const out: { [key: string]: JsonValue } = {};
    for (const [key, value] of Object.entries(summary)) {
        if (value !== null && value !== undefined) out[key] = value as JsonValue;
    }
    return out;
}

async function ingestCspViolations(request: Request, summaries: CspViolationSummary[]) {
    for (const summary of summaries) {
        await logAuditDenied({
            action: 'CSP_VIOLATION_REPORTED',
            resourceType: 'unknown',
            resourceId: summary.documentUri ?? summary.reportUrl ?? '/api/report-csp',
            reasonCode: summary.effectiveDirective ?? summary.violatedDirective ?? 'CSP_VIOLATION',
            changes: toAuditChanges(summary),
            executionContext: {
                surface: 'http',
                operation: 'report-csp',
                request
            }
        });
    }
}

async function parseReportPayload(request: Request): Promise<unknown> {
    const raw = await request.text();
    if (!raw) return null;
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        return {
            parseError: 'invalid_json',
            raw: raw.slice(0, 2_000)
        };
    }
}

export const Route = createFileRoute('/api/report-csp')({
    server: {
        handlers: {
            OPTIONS: async () =>
                new Response(null, {
                    status: 204,
                    headers: {
                        Allow: 'POST, OPTIONS'
                    }
                }),
            POST: async ({ request }: { request: Request }) => {
                const payload = await parseReportPayload(request);

                // Classic CSP report shape: { "csp-report": { ... } }
                const envelope = toRecord(payload) as CspReportEnvelope | null;
                const classicBody = toRecord(envelope?.['csp-report']);
                if (classicBody) {
                    const summary = summarizeViolation(classicBody);
                    await ingestCspViolations(request, [summary]);
                    console.warn('[CSP] Violation report', summary);
                    return new Response(null, { status: 204 });
                }

                // Reporting API shape: [ { type, body, ... }, ... ]
                if (Array.isArray(payload)) {
                    const summaries = payload
                        .map((item) => toRecord(item) as ReportingApiItem | null)
                        .filter((item): item is ReportingApiItem => item !== null)
                        .map((item) => {
                            const body = toRecord(item.body);
                            if (!body) return null;
                            return summarizeViolation(body, {
                                reportType: typeof item.type === 'string' ? item.type : null,
                                reportUrl: typeof item.url === 'string' ? item.url : null,
                                userAgent:
                                    typeof item.user_agent === 'string' ? item.user_agent : null
                            });
                        })
                        .filter((item): item is CspViolationSummary => item !== null);

                    if (summaries.length > 0) {
                        await ingestCspViolations(request, summaries);
                        console.warn('[CSP] Reporting API reports', summaries);
                    } else {
                        console.warn('[CSP] Empty reporting API payload');
                    }
                    return new Response(null, { status: 204 });
                }

                console.warn('[CSP] Unknown report payload shape', payload);
                return new Response(null, { status: 204 });
            }
        }
    }
});
