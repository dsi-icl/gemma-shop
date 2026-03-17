import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

interface ProviderEntry {
    doc: Y.Doc;
    provider: WebsocketProvider;
    refCount: number;
}

const providers = new Map<string, ProviderEntry>();

/**
 * Get or create a Yjs provider for a text layer.
 * @param textScope - Unique scope: `${commitId}/${slideId}/${layerNumericId}`
 */
export function getOrCreateProvider(textScope: string): {
    doc: Y.Doc;
    provider: WebsocketProvider;
} {
    const existing = providers.get(textScope);
    if (existing) {
        existing.refCount++;
        return { doc: existing.doc, provider: existing.provider };
    }

    const doc = new Y.Doc();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/yjs`;
    const provider = new WebsocketProvider(wsUrl, textScope, doc, {
        params: { textScope },
        connect: false // Let CollaborationPlugin call connect() after setting up its 'sync' listener
    });

    providers.set(textScope, { doc, provider, refCount: 1 });
    return { doc, provider };
}

/**
 * Release a reference to a Yjs provider.
 * When refCount hits 0, the provider and doc are destroyed.
 */
export function releaseProvider(textScope: string) {
    const entry = providers.get(textScope);
    if (!entry) return;

    entry.refCount--;
    if (entry.refCount <= 0) {
        entry.provider.destroy();
        entry.doc.destroy();
        providers.delete(textScope);
    }
}
