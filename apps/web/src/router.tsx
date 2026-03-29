import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { getGlobalStartContext } from '@tanstack/react-start';

import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary';
import { DefaultNotFound } from '~/components/DefaultNotFound';

import { routeTree } from './routeTree.gen';
import { RootRouteContext } from './types';
import { getRequest } from './utils/request-tools';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            staleTime: 1000 * 60 * 2 // 2 minutes
        }
    }
});

const getContext = async (): Promise<RootRouteContext> => {
    let url;
    let iframed = false;
    try {
        if (typeof window === 'undefined') {
            const req = getRequest();
            url = new URL(req.url);
            iframed = req.headers.get('sec-fetch-dest') === 'iframe';
        } else {
            url = window.location;
            iframed = window.self !== window.top;
        }
    } catch (err) {
        console.error('Error getting context', err);
        url = new URL('https://gem.dsi.ic.ac.uk');
    }
    const { origin } = url;
    return {
        origin,
        iframed,
        queryClient,
        user: null
    };
};

export async function getRouter() {
    const nonce = getGlobalStartContext()?.nonce;
    const router = createRouter({
        routeTree,
        ssr: { nonce },
        context: await getContext(),
        defaultPreload: 'intent',
        // react-query will handle data fetching & caching
        // https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#passing-all-loader-events-to-an-external-cache
        defaultPreloadStaleTime: 0,
        defaultErrorComponent: DefaultCatchBoundary,
        defaultNotFoundComponent: DefaultNotFound,
        scrollRestoration: true,
        defaultStructuralSharing: true
    });

    setupRouterSsrQueryIntegration({
        router,
        queryClient,
        handleRedirects: true,
        wrapQueryClient: true
    });

    return router;
}
