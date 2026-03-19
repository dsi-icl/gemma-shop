/// <reference types="vite/client" />
import { Toaster } from '@repo/ui/components/sonner';
import { ThemeProvider } from '@repo/ui/lib/theme-provider';
import { TanStackDevtools } from '@tanstack/react-devtools';
import { formDevtoolsPlugin } from '@tanstack/react-form-devtools';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import {
    createRootRouteWithContext,
    HeadContent,
    Outlet,
    ScriptOnce,
    Scripts,
    useRouterState
} from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';

import extraHead from '~/assets/extraHead.json';
import { Footer } from '~/components/Footer';
import { Header } from '~/components/Header';
import { RootRouteContext } from '~/types';

import appCss from '~/styles.css?url';

export const Route = createRootRouteWithContext<RootRouteContext>()({
    // Typically we don't need the user immediately in landing pages.
    // For protected routes with loader data, see /_auth/route.tsx
    // beforeLoad: ({ context }) => {
    //   context.queryClient.prefetchQuery(authQueryOptions());
    // },
    loader: ({ context }) => {
        return {
            origin: context.origin
        };
    },
    head: (ctx) => {
        let { origin } = ctx.loaderData ?? {};
        const extraMeta = origin
            ? [
                  { property: 'og:image', content: `${origin}/og` },
                  { property: 'og:url', content: `${origin}` },
                  { name: 'twitter:image', content: `${origin}/og?o=t` },
                  { name: 'twitter:url', content: `${origin}?o=t` }
              ]
            : [];
        return {
            meta: [
                ...((extraHead ?? {}).meta ?? []),
                {
                    charSet: 'utf-8'
                },
                {
                    name: 'viewport',
                    content: 'width=device-width, initial-scale=1'
                },
                {
                    title: 'GemmaShop'
                },
                { property: 'og:title', content: 'GemmaShop' },
                { property: 'og:description', content: 'GemmaShop' },
                { name: 'twitter:title', content: 'GemmaShop' },
                { name: 'twitter:description', content: 'GemmaShop' },
                {
                    name: 'description',
                    content: 'Blackboard playground for the Data Observatory at Imperial'
                },
                ...extraMeta
            ],
            links: [...((extraHead ?? {}).links ?? []), { rel: 'stylesheet', href: appCss }]
        };
    },
    component: RootComponent
});

function RootComponent() {
    return (
        <RootDocument>
            <Outlet />
        </RootDocument>
    );
}

function RootDocument({ children }: { readonly children: React.ReactNode }) {
    const pathname = useRouterState({
        select: (state) => state.location.pathname
    });
    const isWall = pathname.startsWith('/wall');

    return (
        // suppress since we're updating the "dark" class in a custom script below
        <html lang="en" suppressHydrationWarning className="h-full min-h-full min-w-full bg-black">
            <head>
                <HeadContent />
            </head>
            <body className="relative block h-full min-h-full min-w-full">
                <ScriptOnce>
                    {/* Apply theme early to avoid FOUC */}
                    {`
                    document.documentElement.classList.toggle(
                        'dark',
                        localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
                    );
                    const oldError = console.error; console.error = (...args) => {
                        if (args && typeof args[0] === 'string' && args[0].includes('A tree hydrated but some attributes of the server rendered HTML'))
                            return console.debug('Client and server tree have different attributes.');
                        oldError(...args); }
                    `}
                </ScriptOnce>
                <ThemeProvider>
                    {children}
                    {!isWall ? (
                        <>
                            <Header />
                            <Footer />
                        </>
                    ) : null}
                    <Toaster richColors />
                </ThemeProvider>

                {/* <TanStackDevtools
                    plugins={[
                        {
                            name: 'TanStack Query',
                            render: <ReactQueryDevtoolsPanel />
                        },
                        {
                            name: 'TanStack Router',
                            render: <TanStackRouterDevtoolsPanel />
                        },
                        formDevtoolsPlugin()
                    ]}
                /> */}

                <Scripts />
            </body>
        </html>
    );
}
