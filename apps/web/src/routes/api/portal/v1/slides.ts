import { createFileRoute } from '@tanstack/react-router';

import { scopedState, wallBindings } from '~/lib/busState';
import { pruneExpiredPortalTokens, validatePortalToken } from '~/lib/portalTokens';
import { logAuditDenied } from '~/server/audit';
import { getSlidesMetadata } from '~/server/bus/bus.binding';

function getCorsHeaders(request: Request) {
    const origin = request.headers.get('origin');
    return {
        'Access-Control-Allow-Origin': origin ?? '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

export const Route = createFileRoute('/api/portal/v1/slides')({
    server: {
        handlers: {
            OPTIONS: async ({ request }: { request: Request }) =>
                new Response(null, {
                    status: 204,
                    headers: getCorsHeaders(request)
                }),
            GET: async ({ request }: { request: Request }) => {
                pruneExpiredPortalTokens();

                const token = getBearerToken(request);
                if (!token) {
                    await logAuditDenied({
                        action: 'PORTAL_SLIDES_DENIED',
                        resourceType: 'portal_token',
                        reasonCode: 'MISSING_BEARER_TOKEN',
                        executionContext: {
                            surface: 'http',
                            operation: 'GET /api/portal/v1/slides',
                            request
                        }
                    });
                    return json(request, 401, { error: 'Missing bearer token' });
                }

                const validated = validatePortalToken(token);
                if (!validated) {
                    await logAuditDenied({
                        action: 'PORTAL_SLIDES_DENIED',
                        resourceType: 'portal_token',
                        reasonCode: 'INVALID_OR_EXPIRED_TOKEN',
                        executionContext: {
                            surface: 'http',
                            operation: 'GET /api/portal/v1/slides',
                            request
                        }
                    });
                    return json(request, 401, { error: 'Invalid or expired token' });
                }

                const targetWallId = validated.wallId;
                if (targetWallId !== validated.wallId) {
                    await logAuditDenied({
                        action: 'PORTAL_SLIDES_DENIED',
                        resourceType: 'portal_token',
                        resourceId: targetWallId,
                        reasonCode: 'TOKEN_WALL_MISMATCH',
                        executionContext: {
                            surface: 'http',
                            operation: 'GET /api/portal/v1/slides',
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

                const scope = scopedState.get(validated.scopeId);
                if (!scope) {
                    return json(request, 409, { error: 'Scope no longer exists' });
                }

                const slidesMetadata = await getSlidesMetadata(scope.commitId);

                return json(request, 200, {
                    ok: true,
                    wallId: validated.wallId,
                    projectId: scope.projectId,
                    commitId: scope.commitId,
                    slideId: scope.slideId,
                    slidesMetadata
                });
            }
        }
    }
});
