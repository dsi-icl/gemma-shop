import type { Provider } from '@lexical/yjs';
import type { User } from 'better-auth/client';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

interface ProviderEntry {
    doc: Y.Doc;
    provider: Provider;
}

const providers = new Map<string, ProviderEntry>();
const idenfity = {
    name: '',
    color: `#${Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, '0')}`
};

export function createCollaborativeAuthoringPipe(textScope: string, user: User) {
    const existing = providers.get(textScope);
    if (existing) {
        return { provider: existing.provider as unknown as Provider, doc: existing.doc, idenfity };
    }

    if (idenfity.name === '')
        idenfity.name = `${user.email} (${Math.floor(Math.random() * 1000)
            .toString()
            .padStart(4, '0')})`;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/yjs`;
    const doc = new Y.Doc({ gc: false });
    const provider = new WebsocketProvider(wsUrl, textScope, doc, {
        connect: false // Let CollaborationPlugin call connect() after setting up its 'sync' listener
    }) as unknown as Provider;
    providers.set(textScope, { doc, provider });
    return { provider, doc, idenfity };
}

export function releaseProvider(textScope: string) {
    const entry = providers.get(textScope);
    if (!entry) return;
    entry.provider.disconnect();
    entry.doc.destroy();
    providers.delete(textScope);
}
