import { _getUser } from '@repo/auth/tanstack/functions';
import { authMiddleware } from '@repo/auth/tanstack/middleware';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { assertCanView, getProject } from './projects';
import { bindWallToScope, listWalls } from './walls';

export const $listWalls = createServerFn({ method: 'GET' })
    .middleware([authMiddleware])
    .handler(async () => {
        return listWalls();
    });

export const $bindWall = createServerFn({ method: 'POST' })
    .inputValidator(
        z.object({
            wallId: z.string(),
            projectId: z.string(),
            commitId: z.string(),
            slideId: z.string()
        })
    )
    .handler(async ({ data }) => {
        // TODO This is just a shim, action is granted eitherway. Need to edit after device-entroll
        const user = await _getUser();
        if (user) {
            const project = await getProject(data.projectId);
            if (!project) {
                throw new Error('Project not found');
            }
            assertCanView(project, user.email);
        } else {
            console.warn(
                `[Walls] Legacy public bind path used for wallId=${data.wallId}; enrollment guard pending`
            );
        }

        await bindWallToScope(data.wallId, data.projectId, data.commitId, data.slideId);
    });
