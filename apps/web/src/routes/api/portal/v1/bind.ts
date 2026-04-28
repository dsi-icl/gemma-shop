import { createFileRoute } from '@tanstack/react-router';

import { scopedState, wallBindings } from '~/lib/busState';
import { getCorsHeaders, json, getBearerToken } from '~/lib/portalHttp';
import {
    pruneExpiredPortalTokens,
    validatePortalToken,
    createPortalToken
} from '~/lib/portalTokens';
import { z } from '~/lib/zod';
import { logAuditDenied } from '~/server/audit';
import { performLiveBind } from '~/server/bus/bus.binding';

const bindRequestSchema = z.object({
    slideId: z.string()
});

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

                const currentScopeId = wallBindings.get(validated.wallId);
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

                const newScopeId = wallBindings.get(validated.wallId);
                const fresh =
                    newScopeId !== undefined
                        ? createPortalToken(validated.wallId, newScopeId)
                        : null;

                if (!result.ok) {
                    const status = result.error === 'unknown_wall' ? 404 : 400;
                    return json(request, status, {
                        error: result.error ?? 'bind_failed',
                        token: fresh?.token,
                        expiresAt: fresh?.expiresAt
                    });
                }

                return json(request, 200, {
                    ok: true,
                    wallId: validated.wallId,
                    projectId: scope.projectId,
                    commitId: scope.commitId,
                    slideId: result.resolvedSlideId,
                    token: fresh?.token ?? null,
                    expiresAt: fresh?.expiresAt ?? null
                });
            }
        }
    }
});
