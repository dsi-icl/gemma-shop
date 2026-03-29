import { createFileRoute } from '@tanstack/react-router';

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

function toRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
}

function summarizeViolation(reportBody: Record<string, unknown>): Record<string, unknown> {
    return {
        'document-uri': reportBody['document-uri'],
        'violated-directive': reportBody['violated-directive'],
        'effective-directive': reportBody['effective-directive'],
        'blocked-uri': reportBody['blocked-uri'],
        disposition: reportBody.disposition,
        'original-policy': reportBody['original-policy']
    };
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
                    console.warn('[CSP] Violation report', summarizeViolation(classicBody));
                    return new Response(null, { status: 204 });
                }

                // Reporting API shape: [ { type, body, ... }, ... ]
                if (Array.isArray(payload)) {
                    const summaries = payload
                        .map((item) => toRecord(item) as ReportingApiItem | null)
                        .filter((item): item is ReportingApiItem => item !== null)
                        .map((item) => ({
                            type: item.type,
                            url: item.url,
                            user_agent: item.user_agent,
                            ...(item.body ? summarizeViolation(item.body) : {})
                        }));

                    if (summaries.length > 0) {
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
