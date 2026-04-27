// call the bus function that calls
// another api in v1 to get slides of the project, pass pid
// search token, with token get the slides, create button to bind the slides.
// serving the file from a predictable url with pid cid
// new server fn code editor for admins only $getControlPanelHtml({ projectId, commitId })
// upsert server functions for code editor with admin middleware $upsertControlPanelHtml({ projectId, commitId, html })
// new tab: code editor <textarea> in projects pages only for admins routes/_auth/quarry/projects/$projectId/code-editor.tsx + update $projectId/route.tsx for code-editor route and filter by admin
// extra route to aware of the pid and cid to serve the html
// no code in html template (hello world), first save

import { createFileRoute } from '@tanstack/react-router';

import { scopedState, wallBindings } from '~/lib/busState';
import { pruneExpiredPortalTokens, validatePortalToken } from '~/lib/portalTokens';
import { z } from '~/lib/zod';
import { logAuditDenied } from '~/server/audit';
import { performLiveBind } from '~/server/bus/bus.binding';

const bindRequestSchema = z.object({
    slideId: z.string()
});

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

export const Route = createFileRoute('/api/portal/v1/bind')({
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
                        action: 'PORTAL_BIND_DENIED',
                        resourceType: 'portal_token',
                        reasonCode: 'MISSING_BEARER_TOKEN',
                        executionContext: {
                            surface: 'http',
                            operation: 'POST /api/portal/v1/bind',
                            request
                        }
                    });
                    return json(request, 401, { error: 'Missing bearer token' });
                }

                const validated = validatePortalToken(token);
                if (!validated) {
                    await logAuditDenied({
                        action: 'PORTAL_BIND_DENIED',
                        resourceType: 'portal_token',
                        reasonCode: 'INVALID_OR_EXPIRED_TOKEN',
                        executionContext: {
                            surface: 'http',
                            operation: 'POST /api/portal/v1/bind',
                            request
                        }
                    });
                    return json(request, 401, { error: 'Invalid or expired token' });
                }

                let body: z.infer<typeof bindRequestSchema>;
                try {
                    body = bindRequestSchema.parse(await request.json().catch(() => ({})));
                } catch (error: any) {
                    return json(request, 400, {
                        error: 'Invalid request body',
                        details: error?.message ?? String(error)
                    });
                }

                const targetWallId = validated.wallId;
                if (targetWallId !== validated.wallId) {
                    await logAuditDenied({
                        action: 'PORTAL_BIND_DENIED',
                        resourceType: 'portal_token',
                        resourceId: targetWallId,
                        reasonCode: 'TOKEN_WALL_MISMATCH',
                        executionContext: {
                            surface: 'http',
                            operation: 'POST /api/portal/v1/bind',
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

                const result = await performLiveBind(
                    validated.wallId,
                    scope.projectId,
                    scope.commitId,
                    body.slideId,
                    'gallery'
                );

                if (!result.ok) {
                    const status = result.error === 'unknown_wall' ? 404 : 400;
                    return json(request, status, { error: result.error ?? 'bind_failed' });
                }

                return json(request, 200, {
                    ok: true,
                    wallId: validated.wallId,
                    projectId: scope.projectId,
                    commitId: scope.commitId,
                    slideId: result.resolvedSlideId
                });
            }
        }
    }
});
