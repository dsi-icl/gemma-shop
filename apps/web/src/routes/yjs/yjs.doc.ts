import * as encoding from 'lib0/encoding';
import { Binary } from 'mongodb';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';

import type { Layer } from '~/lib/types';
import { dbCol } from '~/server/collections';

export const messageSync = 0;
export const messageAwareness = 1;
export const SYNC_INTERVAL_MS = 1000;

export type TextLayer = Extract<Layer, { type: 'text' }>;

export type DocScope = {
    projectId: string;
    commitId: string;
    slideId: string;
    layerId: number;
};

type AwarenessChanges = {
    added: number[];
    updated: number[];
    removed: number[];
};

export interface Persistence {
    bindState: (scope: string, doc: SharedDoc) => Promise<boolean>;
    writeState: (scope: string, doc: SharedDoc) => Promise<void>;
    provider: unknown;
}

/**
 * Minimal callback surface that SharedDoc needs from YCrossws.
 * Using an interface instead of the concrete class avoids a circular import
 * between yjs.doc.ts and yjs.session.ts.
 */
export interface YcRef {
    onDocUpdate: (
        update: Uint8Array,
        origin: unknown,
        doc: Y.Doc,
        transaction: Y.Transaction
    ) => void;
    flushDoc: (doc: SharedDoc) => Promise<void>;
}

export function binaryToUint8Array(data: unknown): Uint8Array | null {
    if (!data) return null;
    if (data instanceof Uint8Array) return data;
    if (data instanceof Binary) {
        const buffer = data.buffer;
        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }
    if (Buffer.isBuffer(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    if (typeof data === 'string') {
        return new Uint8Array(Buffer.from(data, 'base64'));
    }
    return null;
}

export async function loadTextLayer(scope: DocScope): Promise<TextLayer> {
    const commit = await dbCol.commits.findById(scope.commitId);
    if (
        !commit ||
        String(commit.projectId) !== scope.projectId ||
        !commit.content?.slides ||
        !Array.isArray(commit.content.slides)
    ) {
        throw new Error(`Commit not found or invalid content for ${scope.commitId}`);
    }

    const slide = commit.content.slides.find((s: any) => s?.id === scope.slideId);
    if (!slide?.layers || !Array.isArray(slide.layers)) {
        throw new Error(`Slide ${scope.slideId} not found in commit ${scope.commitId}`);
    }

    const layer = slide.layers.find((l: any) => l?.numericId === scope.layerId);
    if (!layer || layer.type !== 'text') {
        throw new Error(`Text layer ${scope.layerId} not found in slide ${scope.slideId}`);
    }
    return layer as TextLayer;
}

export class MongoYDocPersistence implements Persistence {
    provider: unknown = null;
    private indexReady: Promise<void>;

    constructor() {
        this.indexReady = dbCol.ydocs
            .ensureScopeIndex()
            .then(() => {
                if (process.env.YJS_DEBUG === 'true')
                    console.log('[YJS] ydocs.scope unique index ensured');
            })
            .catch((err) => {
                console.error('[YJS] Failed to ensure ydocs.scope unique index:', err);
            });
    }

    async bindState(scope: string, doc: SharedDoc): Promise<boolean> {
        await this.indexReady;
        const data = await dbCol.ydocs.findDataByScope(scope);
        if (!data) return false;
        const update = binaryToUint8Array(data);
        if (!update || update.byteLength === 0) return false;
        Y.applyUpdate(doc, update);
        return true;
    }

    async writeState(scope: string, doc: SharedDoc): Promise<void> {
        await this.indexReady;
        const update = Y.encodeStateAsUpdate(doc);
        await dbCol.ydocs.upsertByScope(scope, new Binary(Buffer.from(update)));
    }
}

export class SharedDoc extends Y.Doc {
    name: string;
    yc: YcRef;
    scope: DocScope;
    awareness: awarenessProtocol.Awareness;
    peerIds: Map<import('crossws').Peer, Set<number>> = new Map();
    dirty = false;
    syncTimer: ReturnType<typeof setInterval> | null = null;
    flushPromise: Promise<void> | null = null;
    lastHtmlHash: string | null = null;
    fallbackLayer: TextLayer | null = null;

    constructor(name: string, scope: DocScope, yc: YcRef) {
        super();
        this.name = name;
        this.scope = scope;
        this.yc = yc;
        this.awareness = new awarenessProtocol.Awareness(this);
        this.awareness.setLocalState(null);
        this.awareness.on('update', this.onAwarenessUpdate.bind(this));
        this.on('update', yc.onDocUpdate.bind(yc));
        this.on('update', () => {
            this.dirty = true;
        });
    }

    startSyncLoop() {
        if (this.syncTimer) return;
        this.syncTimer = setInterval(() => {
            void this.yc.flushDoc(this);
        }, SYNC_INTERVAL_MS);
    }

    stopSyncLoop() {
        if (!this.syncTimer) return;
        clearInterval(this.syncTimer);
        this.syncTimer = null;
    }

    onAwarenessUpdate(changes: AwarenessChanges, peer?: import('crossws').Peer) {
        if (peer) {
            const peerControlledIDs = this.peerIds.get(peer);
            if (peerControlledIDs !== undefined) {
                for (const clientID of changes.added) peerControlledIDs.add(clientID);
                for (const clientID of changes.removed) peerControlledIDs.delete(clientID);
            }
        }
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
