import { createMiddleware } from '@tanstack/react-start';

import { hasAuthenticatedActor, type AuthContext } from './requestAuthContext';

export const actorAuthContextMiddleware = createMiddleware().server(async ({ next, context }) => {
    const authContext = (context as { authContext?: AuthContext } | undefined)?.authContext ?? {
        guest: true
    };

    if (!hasAuthenticatedActor(authContext)) {
        throw new Error('Unauthorized');
    }

    return next({
        context: {
            ...(context ?? {}),
            authContext
        }
    });
});
