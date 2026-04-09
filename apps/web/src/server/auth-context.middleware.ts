import { createMiddleware } from '@tanstack/react-start';

import { logAuditDenied } from './audit';
import { hasAuthenticatedActor, type AuthContext } from './requestAuthContext';

export const actorAuthContextMiddleware = createMiddleware().server(
    async ({ next, context, request }) => {
        const authContext = (context as { authContext?: AuthContext } | undefined)?.authContext ?? {
            guest: true
        };

        if (!hasAuthenticatedActor(authContext)) {
            await logAuditDenied({
                action: 'ACTOR_AUTH_CONTEXT_DENIED',
                reasonCode: 'UNAUTHORIZED',
                authContext,
                executionContext: {
                    surface: 'serverfn',
                    operation: 'actorAuthContextMiddleware',
                    request
                }
            });
            throw new Error('Unauthorized');
        }

        return next({
            context: {
                ...(context ?? {}),
                authContext
            }
        });
    }
);
