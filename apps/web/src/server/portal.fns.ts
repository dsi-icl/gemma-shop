import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { wallBindings } from '~/lib/busState';
import { createPortalToken, pruneExpiredPortalTokens } from '~/lib/portalTokens';

export const $issueControllerPortalToken = createServerFn({ method: 'POST' })
    .inputValidator(
        z.object({
            wallId: z.string()
        })
    )
    .handler(async ({ data }) => {
        pruneExpiredPortalTokens();
        const scopeId = wallBindings.get(data.wallId);
        if (scopeId === undefined) {
            throw new Error('Wall is not currently bound');
        }
        return createPortalToken(data.wallId, scopeId);
    });
