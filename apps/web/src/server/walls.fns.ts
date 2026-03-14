import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { bindWallToScope, listWalls } from './walls';

export const $listWalls = createServerFn({ method: 'GET' }).handler(async () => {
    return listWalls();
});

export const $bindWall = createServerFn({ method: 'POST' })
    .inputValidator(
        z.object({
            wallId: z.string(),
            projectId: z.string(),
            slideId: z.string()
        })
    )
    .handler(async ({ data }) => {
        await bindWallToScope(data.wallId, data.projectId, data.slideId);
    });
