import { _getUser } from '@repo/auth/tanstack/functions';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { scopedState, wallBindings, wallBindingSources } from '~/lib/busState';
import { createPortalToken, pruneExpiredPortalTokens } from '~/lib/portalTokens';
import { assertCanView, getProject } from '~/server/projects';

export const $issueControllerPortalToken = createServerFn({ method: 'POST' })
    .inputValidator(
        z.object({
            wallId: z.string()
        })
    )
    .handler(async ({ data }) => {
        const user = await _getUser();

        pruneExpiredPortalTokens();
        const scopeId = wallBindings.get(data.wallId);
        if (scopeId === undefined) {
            throw new Error('Wall is not currently bound');
        }

        const source = wallBindingSources.get(data.wallId);
        if (source !== 'gallery') {
            throw new Error('Controller token issuance is only available for gallery');
        }

        const scope = scopedState.get(scopeId);
        if (!scope) {
            throw new Error('Wall scope is not available');
        }

        // TODO we need to transform when device-enroll is done
        if (user) {
            const project = await getProject(scope.projectId);
            if (!project) {
                throw new Error('Project not found');
            }
            assertCanView(project, user.email);
        } else {
            console.warn(`[Portal] Legacy public token issue path used`);
        }

        return createPortalToken(data.wallId, scopeId);
    });
