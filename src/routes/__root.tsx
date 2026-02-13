import type { QueryClient } from '@tanstack/react-query';

import { TanStackDevtools } from '@tanstack/react-devtools';
import { HeadContent, Scripts, createRootRouteWithContext, redirect } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';

import { getLocale, shouldRedirect } from '@/paraglide/runtime.js';

import Header from '../components/Header';
import TanStackQueryDevtools from '../integrations/tanstack-query/devtools';
import appCss from '../styles.css?url';

interface MyRouterContext {
    queryClient: QueryClient;
}

if (process.env.NODE_ENV === 'development') {
    const originalError = console.error;

    console.error = (...args) => {
        if (typeof args[0] === 'string' && /-\s*bis_skin_checked/gm.test(args[0])) {
            // originalError('Suppressed React hydration error related');
            return;
        }
        originalError(...args);
    };
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
    beforeLoad: async () => {
        // Other redirect strategies are possible; see
        // https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide#offline-redirect
        if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('lang', getLocale());
        }
    },
    notFoundComponent: () => <div>Page Not Found</div>,
    head: () => ({
        meta: [
            {
                charSet: 'utf-8'
            },
            {
                name: 'viewport',
                content:
                    'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no'
            },
            {
                title: 'GemmaShop'
            }
        ],
        links: [
            {
                rel: 'stylesheet',
                href: appCss
            }
        ]
    }),

    shellComponent: RootDocument
});

function RootDocument({ children }: { children: React.ReactNode }) {
    return (
        <html lang={getLocale()} suppressHydrationWarning className="dark h-full">
            <head>
                <HeadContent />
            </head>
            <body suppressHydrationWarning className="flex h-full flex-col">
                <Header />
                {children}
                <TanStackDevtools
                    config={{
                        position: 'bottom-right'
                    }}
                    plugins={[
                        {
                            name: 'Tanstack Router',
                            render: <TanStackRouterDevtoolsPanel />
                        },
                        TanStackQueryDevtools
                    ]}
                />
                <Scripts />
            </body>
        </html>
    );
}
