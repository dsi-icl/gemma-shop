// src/client.tsx
import { StartClient } from '@tanstack/react-start/client';
import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';

import { ErrorBoundary } from './components/error-boundary';

hydrateRoot(
    document,
    <StrictMode>
        <ErrorBoundary>
            <StartClient />
        </ErrorBoundary>
    </StrictMode>,
    {
        onCaughtError: (err) => {
            console.error(err);
        },
        onRecoverableError: (err) => {
            if (
                err instanceof Error &&
                err.message.includes('Hydration failed because the server rendered text')
            )
                console.debug('Hydration failed.');
            else console.error(err);
        },
        onUncaughtError: (err) => {
            console.error(err);
        },
    },
);
