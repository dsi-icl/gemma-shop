import { queryOptions } from '@tanstack/react-query';

import { $listWalls } from './walls.fns';

export const wallsQueryOptions = () =>
    queryOptions({
        queryKey: ['walls'],
        queryFn: () => $listWalls()
    });
