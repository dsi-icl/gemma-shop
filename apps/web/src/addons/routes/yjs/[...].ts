import type * as crossws from 'crossws';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { defineWebSocketHandler } from 'nitro/h3';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

class YCrossws {
    persistence?: Persistence;
    docs: Map<string, SharedDoc> = new Map();

    onOpen(peer: crossws.Peer) {
        const doc = this.getDoc(peer);
        // Send sync step 1
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.writeSyncStep1(encoder, doc);
        peer.send(encoding.toUint8Array(encoder));
        const awarenessStates = doc.awareness.getStates();
        if (awarenessStates.size > 0) {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, messageAwareness);
            encoding.writeVarUint8Array(
                encoder,
                awarenessProtocol.encodeAwarenessUpdate(doc.awareness, [...awarenessStates.keys()])
            );
            peer.send(encoding.toUint8Array(encoder));
        }
    }

    onMessage(peer: crossws.Peer, message: crossws.Message) {
        const doc = this.getDoc(peer);
        try {
            const encoder = encoding.createEncoder();
            const data = message.uint8Array();
            const decoder = decoding.createDecoder(data);
            const messageType = decoding.readVarUint(decoder);
            switch (messageType) {
                case messageSync: {
                    encoding.writeVarUint(encoder, messageSync);
                    syncProtocol.readSyncMessage(decoder, encoder, doc, peer);
                    // If the `encoder` only contains the type of reply message and no
                    // message, there is no need to send the message. When `encoder` only
                    // contains the type of reply, its length is 1.
                    if (encoding.length(encoder) > 1) {
                        peer.send(encoding.toUint8Array(encoder));
                    }
                    break;
                }
                case messageAwareness: {
                    awarenessProtocol.applyAwarenessUpdate(
                        doc.awareness,
                        decoding.readVarUint8Array(decoder),
                        peer
                    );
                    break;
                }
            }
        } catch (error) {
            console.error(error);
            // @ts-expect-error
            doc.emit('error', [error]);
        }
    }

    onClose(peer: crossws.Peer) {
        const doc = this.getDoc(peer);
        if (doc.peerIds.has(peer)) {
            const controlledIds = doc.peerIds.get(peer) || [];
            doc.peerIds.delete(peer);
            awarenessProtocol.removeAwarenessStates(doc.awareness, [...controlledIds], undefined);
            if (doc.peerIds.size === 0 && this.persistence) {
                // If persisted, we store state and destroy ydocument
                this.persistence.writeState(doc.name, doc).then(() => {
                    doc.destroy();
                });
                this.docs.delete(doc.name);
            }
        }
        // peer.close(); // TODO
    }

    onDocUpdate(update: Uint8Array, _peer: crossws.Peer, doc: Y.Doc, _transaction: Y.Transaction) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.writeUpdate(encoder, update);
        const message = encoding.toUint8Array(encoder);
        for (const peer of (doc as SharedDoc).peerIds.keys()) {
            peer.send(message);
        }
    }

    getDoc(peer: crossws.Peer): SharedDoc {
        if ((peer as any)._ycdoc) {
            return (peer as any)._ycdoc;
        }
        const docName = new URL(peer.request?.url!).pathname.slice(1);
        let doc = this.docs.get(docName);
        if (!doc) {
            doc = new SharedDoc(docName, this);
            doc.gc = true;
            this.persistence?.bindState(docName, doc);
            this.docs.set(docName, doc);
        }
        if (!doc.peerIds.has(peer)) {
            doc.peerIds.set(peer, new Set());
        }
        (peer as any)._ycdoc = doc;
        return doc;
    }
}

class SharedDoc extends Y.Doc {
    name: string;
    yc: YCrossws;
    awareness: awarenessProtocol.Awareness;
    peerIds: Map<crossws.Peer, Set<number>> = new Map();

    constructor(name: string, yc: YCrossws) {
        super();
        this.name = name;
        console.log('Creating new document ', name);
        this.yc = yc;
        this.awareness = new awarenessProtocol.Awareness(this);
        this.awareness.setLocalState(null);
        this.awareness.on('update', this.onAwarenessUpdate.bind(this));
        this.on('update', yc.onDocUpdate.bind(yc));
    }

    onAwarenessUpdate(changes: AwarenessChanges, peer?: crossws.Peer) {
        // Update peerIds map
        if (peer) {
            const peerControlledIDs = this.peerIds.get(peer);
            if (peerControlledIDs !== undefined) {
                for (const clientID of changes.added) {
                    peerControlledIDs.add(clientID);
                }
                for (const clientID of changes.removed) {
                    peerControlledIDs.delete(clientID);
                }
            }
        }
        // Broadcast awareness update
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageAwareness);
        encoding.writeVarUint8Array(
            encoder,
            awarenessProtocol.encodeAwarenessUpdate(this.awareness, [
                ...changes.added,
                ...changes.updated,
                ...changes.removed
            ])
        );
        const buff = encoding.toUint8Array(encoder);
        for (const peer of this.peerIds.keys()) {
            peer.send(buff);
        }
    }
}

const messageSync = 0;
const messageAwareness = 1;

type AwarenessChanges = {
    added: number[];
    updated: number[];
    removed: number[];
};

interface Persistence {
    bindState: (a: string, doc: SharedDoc) => void;
    writeState: (a: string, doc: SharedDoc) => Promise<any>;
    provider: any;
}

function createHandler() {
    const yc = new YCrossws();
    const hooks: Partial<crossws.Hooks> = {
        open(peer) {
            yc.onOpen(peer);
        },
        message(peer, message) {
            yc.onMessage(peer, message);
        },
        close(peer) {
            yc.onClose(peer);
        }
    };
    return {
        hooks: hooks as crossws.Hooks
    };
}

export default defineWebSocketHandler(createHandler().hooks);
