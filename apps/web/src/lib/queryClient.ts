import { QueryClient } from '@tanstack/react-query';

const APP_QUERY_CLIENT_DEFAULTS = {
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            staleTime: 1000 * 60 * 2 // 2 minutes
        }
    }
} as const;

let browserQueryClient: QueryClient | null = null;

export function createAppQueryClient() {
    return new QueryClient(APP_QUERY_CLIENT_DEFAULTS);
}

export function getBrowserQueryClient() {
    if (typeof window === 'undefined') {
        return createAppQueryClient();
    }
    if (!browserQueryClient) {
        browserQueryClient = createAppQueryClient();
    }
    return browserQueryClient;
}
