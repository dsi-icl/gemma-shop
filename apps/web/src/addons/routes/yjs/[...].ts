import type { Peer } from 'crossws';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { defineWebSocketHandler } from 'nitro/h3';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

interface SharedDoc {
    doc: Y.Doc;
    awareness: awarenessProtocol.Awareness;
    peers: Set<Peer>;
}

/** In-memory store: textLayerScope → SharedDoc. Survives Vite HMR via process global. */
const _hmr = (process as any).__YJS_HMR__ ?? {
    docs: new Map<string, SharedDoc>()
};
(process as any).__YJS_HMR__ = _hmr;

const docs: Map<string, SharedDoc> = _hmr.docs;

function getOrCreateDoc(textLayerScope: string): SharedDoc {
    let entry = docs.get(textLayerScope);
    if (entry) return entry;

    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    entry = { doc, awareness, peers: new Set() };
    docs.set(textLayerScope, entry);

    // Broadcast doc updates to all connected peers
    doc.on('update', (update: Uint8Array, origin: unknown) => {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 0); // messageSync
        syncProtocol.writeUpdate(encoder, update);
        const msg = encoding.toUint8Array(encoder);

        for (const peer of entry!.peers) {
            if (peer !== origin) {
                try {
                    peer.send(msg);
                } catch {
                    // peer disconnected
                }
            }
        }
    });

    // Broadcast awareness updates
    awareness.on(
        'update',
        ({
            added,
            updated,
            removed
        }: {
            added: number[];
            updated: number[];
            removed: number[];
        }) => {
            const changedClients = added.concat(updated, removed);
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 1); // messageAwareness
            encoding.writeVarUint8Array(
                encoder,
                awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
            );
            const msg = encoding.toUint8Array(encoder);

            for (const peer of entry!.peers) {
                try {
                    peer.send(msg);
                } catch {
                    // peer disconnected
                }
            }
        }
    );

    return entry;
}

function cleanupDoc(textLayerScope: string) {
    const entry = docs.get(textLayerScope);
    if (!entry || entry.peers.size > 0) return;
    // TODO decide if it makes sense to keep the document in memory eventually ....
    console.log('Cleaning server YJS doc for scope', textLayerScope);
    entry.doc.destroy();
    docs.delete(textLayerScope);
}

const messageSync = 0;
const messageAwareness = 1;
const peerScopes = new Map<string, string>();

export default defineWebSocketHandler({
    open(peer) {
        peer.websocket.binaryType = 'arraybuffer';

        // Extract textLayerScope from URL query
        const url = peer.request?.url ?? peer.websocket.url ?? '';
        const parsed = new URL(url);
        const textLayerScope = parsed.pathname.replace('/yjs/', '');

        if (!textLayerScope) {
            peer.close(4000, 'Missing textLayerScope query parameter');
            return;
        }

        peerScopes.set(peer.id, textLayerScope);
        const entry = getOrCreateDoc(textLayerScope);
        entry.peers.add(peer);

        try {
            // Send sync step 1
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, messageSync);
            syncProtocol.writeSyncStep1(encoder, entry.doc);
            peer.send(encoding.toUint8Array(encoder));

            // Send current awareness state
            const awarenessStates = entry.awareness.getStates();
            if (awarenessStates.size > 0) {
                const awarenessEncoder = encoding.createEncoder();
                encoding.writeVarUint(awarenessEncoder, messageAwareness);
                encoding.writeVarUint8Array(
                    awarenessEncoder,
                    awarenessProtocol.encodeAwarenessUpdate(
                        entry.awareness,
                        Array.from(awarenessStates.keys())
                    )
                );
                peer.send(encoding.toUint8Array(awarenessEncoder));
            }
        } catch (e) {
            console.error('SEND ERROR', e);
        }
    },

    message(peer, message) {
        const textLayerScope = peerScopes.get(peer.id);
        if (!textLayerScope) return;

        const entry = docs.get(textLayerScope);
        if (!entry) return;

        const data =
            message.rawData instanceof ArrayBuffer
                ? new Uint8Array(message.rawData)
                : message.rawData instanceof Buffer
                  ? new TextEncoder().encode(message.text())
                  : new Uint8Array((message as any).buffer ?? message);

        const decoder = decoding.createDecoder(data);
        const messageType = decoding.readVarUint(decoder);

        switch (messageType) {
            case messageSync: {
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, messageSync);
                syncProtocol.readSyncMessage(decoder, encoder, entry.doc, peer);
                const reply = encoding.toUint8Array(encoder);
                // Only send if there's actual content (more than just the message type byte)
                if (encoding.length(encoder) > 1) {
                    peer.send(reply);
                }
                break;
            }

            case messageAwareness: {
                awarenessProtocol.applyAwarenessUpdate(
                    entry.awareness,
                    decoding.readVarUint8Array(decoder),
                    peer
                );
                break;
            }
        }
    },

    close(peer) {
        const textLayerScope = peerScopes.get(peer.id);
        peerScopes.delete(peer.id);

        if (!textLayerScope) return;
        const entry = docs.get(textLayerScope);
        if (!entry) return;

        entry.peers.delete(peer);

        // Remove awareness state for this peer
        awarenessProtocol.removeAwarenessStates(entry.awareness, [entry.doc.clientID], null);

        cleanupDoc(textLayerScope);
    }
});
