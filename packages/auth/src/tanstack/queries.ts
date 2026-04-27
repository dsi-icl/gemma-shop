import { queryOptions } from '@tanstack/react-query';

import { $getAuthSession, $getUser } from './functions';

export const authQueryOptions = () =>
    queryOptions({
        queryKey: ['user'],
        queryFn: ({ signal }) => $getUser({ signal })
    });

export type AuthQueryResult = Awaited<ReturnType<typeof $getUser>>;

export const authSessionQueryOptions = () =>
    queryOptions({
        queryKey: ['auth', 'session'],
        queryFn: ({ signal }) => $getAuthSession({ signal })
    });

export type AuthSessionQueryResult = Awaited<ReturnType<typeof $getAuthSession>>;
