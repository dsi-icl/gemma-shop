import { authMiddleware } from '@repo/auth/tanstack/middleware';
import { createServerFn } from '@tanstack/react-start';

import { listWalls } from './walls';

export const $listWalls = createServerFn({ method: 'GET' })
    .middleware([authMiddleware])
    .handler(async () => {
        return listWalls();
    });
