import { createMiddleware } from '@tanstack/react-start';

import { hasAuthenticatedActor, type RequestAuthContext } from './requestAuthContext';

export const actorAuthContextMiddleware = createMiddleware().server(async ({ next, context }) => {
    const upstream = (context ?? {}) as {
        authContext?: RequestAuthContext;
        user?: Record<string, any> | null;
    };
    const resolved = {
        authContext: upstream.authContext ?? { guest: true },
        user: upstream.user ?? null
    };

    if (!hasAuthenticatedActor(resolved.authContext)) {
        throw new Error('Unauthorized');
    }

    return next({
        context: {
            ...(context ?? {}),
            authContext: resolved.authContext,
            user: resolved.user
        }
    });
});

export function getAuthContextEmail(authContext: RequestAuthContext | undefined): string | null {
    const email = authContext?.user?.email;
    return typeof email === 'string' && email.length > 0 ? email : null;
}
