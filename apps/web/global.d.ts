import { AuthQueryResult } from '@repo/auth/tanstack/queries';
import { QueryClient } from '@tanstack/react-query';

export type RootRouteContext = {
    origin: string;
    iframed: boolean;
    user: AuthQueryResult | null;
    queryClient: QueryClient;
};
