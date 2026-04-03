import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { wallBindings } from '~/lib/busState';
import { createPortalToken, pruneExpiredPortalTokens } from '~/lib/portalTokens';
import { actorAuthContextMiddleware } from '~/server/auth-context.middleware';
import type { AuthContext } from '~/server/requestAuthContext';

export const $issueControllerPortalToken = createServerFn({ method: 'POST' })
    .inputValidator(
        z.object({
            wallId: z.string()
        })
    )
    .middleware([actorAuthContextMiddleware])
    .handler(async ({ data, context }) => {
        const authContext = (context as { authContext?: AuthContext } | undefined)?.authContext;
        const device = authContext?.device;
        if (!device || device.kind !== 'gallery') {
            throw new Error('Forbidden');
        }
        if (device.wallId && device.wallId !== data.wallId) {
            throw new Error('Forbidden');
        }

        pruneExpiredPortalTokens();
        const scopeId = wallBindings.get(data.wallId);
        if (scopeId === undefined) {
            throw new Error('Wall is not currently bound');
        }
        return createPortalToken(data.wallId, scopeId);
    });
