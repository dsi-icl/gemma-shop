import { createFileRoute } from '@tanstack/react-router';

import { wallBindings } from '~/lib/busState';
import { pruneExpiredPortalTokens, validatePortalToken } from '~/lib/portalTokens';
import { z } from '~/lib/zod';
import { logAuditDenied } from '~/server/audit';

const rebootRequestSchema = z
    .object({
        wallId: z.string().optional(),
        c: z.number().int().nonnegative().optional(),
        r: z.number().int().nonnegative().optional()
    })
    .default({});

function getCorsHeaders(request: Request) {
    const origin = request.headers.get('origin');
    return {
        'Access-Control-Allow-Origin': origin ?? '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin'
    } as const;
}

function json(request: Request, status: number, payload: unknown) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(request)
        }
    });
}

function getBearerToken(request: Request): string | null {
    const auth = request.headers.get('authorization');
    if (auth && auth.toLowerCase().startsWith('bearer ')) {
        return auth.slice(7).trim();
    }
    const url = new URL(request.url);
    const fallback = url.searchParams.get('_gem_t');
    return fallback && fallback.trim().length > 0 ? fallback.trim() : null;
}

export const Route = createFileRoute('/api/portal/v1/reboot')({
    server: {
        handlers: {
            OPTIONS: async ({ request }: { request: Request }) =>
                new Response(null, {
                    status: 204,
                    headers: getCorsHeaders(request)
                }),
            POST: async ({ request }: { request: Request }) => {
                pruneExpiredPortalTokens();

                const token = getBearerToken(request);
                if (!token) {
                    await logAuditDenied({
                        action: 'PORTAL_REBOOT_DENIED',
                        resourceType: 'portal_token',
                        reasonCode: 'MISSING_BEARER_TOKEN',
                        executionContext: {
                            surface: 'http',
                            operation: 'POST /api/portal/v1/reboot',
                            request
                        }
                    });
                    return json(request, 401, { error: 'Missing bearer token' });
                }

                const validated = validatePortalToken(token);
                if (!validated) {
                    await logAuditDenied({
                        action: 'PORTAL_REBOOT_DENIED',
                        resourceType: 'portal_token',
                        reasonCode: 'INVALID_OR_EXPIRED_TOKEN',
                        executionContext: {
                            surface: 'http',
                            operation: 'POST /api/portal/v1/reboot',
                            request
                        }
                    });
                    return json(request, 401, { error: 'Invalid or expired token' });
                }

                let body: z.infer<typeof rebootRequestSchema>;
                try {
                    body = rebootRequestSchema.parse(await request.json().catch(() => ({})));
                } catch (error: any) {
                    return json(request, 400, {
                        error: 'Invalid request body',
                        details: error?.message ?? String(error)
                    });
                }

                const targetWallId = body.wallId ?? validated.wallId;
                if (targetWallId !== validated.wallId) {
                    await logAuditDenied({
                        action: 'PORTAL_REBOOT_DENIED',
                        resourceType: 'portal_token',
                        resourceId: targetWallId,
                        reasonCode: 'TOKEN_WALL_MISMATCH',
                        executionContext: {
                            surface: 'http',
                            operation: 'POST /api/portal/v1/reboot',
                            request
                        }
                    });
                    return json(request, 403, {
                        error: 'Token is not allowed to control this wall'
                    });
                }

                const currentScopeId = wallBindings.get(targetWallId);
                if (currentScopeId === undefined || currentScopeId !== validated.scopeId) {
                    return json(request, 409, {
                        error: 'Wall is no longer bound to the token scope'
                    });
                }

                const rebootWall = process.__REBOOT_WALL__;
                if (!rebootWall) {
                    return json(request, 503, { error: 'Wall bus bridge unavailable' });
                }

                const hasNodeTarget = body.c !== undefined || body.r !== undefined;
                if ((body.c === undefined) !== (body.r === undefined)) {
                    return json(request, 400, {
                        error: 'Both c and r must be provided together when targeting a node'
                    });
                }

                const sent = hasNodeTarget
                    ? rebootWall(targetWallId, { c: body.c!, r: body.r! })
                    : rebootWall(targetWallId);

                if (sent <= 0) {
                    return json(request, 404, {
                        error: hasNodeTarget
                            ? 'No wall node found for the requested c/r'
                            : 'No connected wall nodes for this wall'
                    });
                }

                return json(request, 200, {
                    ok: true,
                    wallId: targetWallId,
                    scopeId: validated.scopeId,
                    targetedNode: hasNodeTarget ? { c: body.c, r: body.r } : null,
                    sent
                });
            }
        }
    }
});
