import { adminMiddleware } from '@repo/auth/tanstack/middleware';
import { createServerFn } from '@tanstack/react-start';

import { listWalls } from './walls';

export const $listWalls = createServerFn({ method: 'GET' })
    .middleware([adminMiddleware])
    .handler(async () => {
        return listWalls();
    });
