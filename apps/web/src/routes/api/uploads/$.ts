import path from 'node:path';

import { createFileRoute } from '@tanstack/react-router';
import { FileStore } from '@tus/file-store';
import { Server } from '@tus/server';

const tusServer = new Server({
    path: '/api/uploads',
    datastore: new FileStore({ directory: path.resolve('.uploads') })
});

function handleTus({ request }: { request: Request }) {
    return tusServer.handleWeb(request);
}

export const Route = createFileRoute('/api/uploads/$')({
    server: {
        handlers: {
            ANY: handleTus
        }
    }
});
