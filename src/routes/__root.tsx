import { TanStackDevtools } from '@tanstack/react-devtools';
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';

import appCss from '../styles.css?url';

export const Route = createRootRoute({
    ssr: false,
    head: () => ({
        meta: [
            { charSet: 'utf-8' },
            { name: 'viewport', content: 'width=device-width, initial-scale=1' },
            { title: 'Gemma Cast' }
        ],
        links: [{ rel: 'stylesheet', href: appCss }]
    }),
    notFoundComponent: () => <div>Not Found</div>,
    shellComponent: RootDocument
});

function RootDocument({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <HeadContent />
            </head>
            <body>
                {children}
                <TanStackDevtools
                    config={{ position: 'bottom-right' }}
                    plugins={[{ name: 'Tanstack Router', render: <TanStackRouterDevtoolsPanel /> }]}
                />
                <Scripts />
            </body>
        </html>
    );
}
