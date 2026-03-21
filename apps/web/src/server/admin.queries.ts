import { queryOptions } from '@tanstack/react-query';

import {
    $adminGetWallBindingMeta,
    $adminGetStats,
    $adminListProjects,
    $adminListPublicAssets,
    $adminListUsers,
    $adminListWalls
} from './admin.fns';

export const adminUsersQueryOptions = () =>
    queryOptions({
        queryKey: ['admin', 'users'],
        queryFn: () => $adminListUsers()
    });

export const adminProjectsQueryOptions = () =>
    queryOptions({
        queryKey: ['admin', 'projects'],
        queryFn: () => $adminListProjects()
    });

export const adminStatsQueryOptions = () =>
    queryOptions({
        queryKey: ['admin', 'stats'],
        queryFn: () => $adminGetStats(),
        refetchInterval: 10_000
    });

export const adminWallsQueryOptions = () =>
    queryOptions({
        queryKey: ['admin', 'walls'],
        queryFn: () => $adminListWalls(),
        refetchInterval: 5_000
    });

export const adminPublicAssetsQueryOptions = () =>
    queryOptions({
        queryKey: ['admin', 'public-assets'],
        queryFn: () => $adminListPublicAssets()
    });

export const adminWallBindingMetaQueryOptions = (input: {
    boundProjectId?: string | null;
    boundCommitId?: string | null;
    boundSlideId?: string | null;
}) =>
    queryOptions({
        queryKey: ['admin', 'walls', 'binding-meta', input],
        queryFn: () =>
            $adminGetWallBindingMeta({
                data: {
                    boundProjectId: input.boundProjectId ?? null,
                    boundCommitId: input.boundCommitId ?? null,
                    boundSlideId: input.boundSlideId ?? null
                }
            }),
        staleTime: 15_000
    });
