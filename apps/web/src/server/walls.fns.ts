import { createServerFn } from '@tanstack/react-start';

import { listWalls } from './walls';

export const $listWalls = createServerFn({ method: 'GET' }).handler(async () => {
    return listWalls();
});
