import { createHash } from 'node:crypto';

import { createHeadlessEditor } from '@lexical/headless';
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import { createBinding, syncLexicalUpdateToYjs, syncYjsChangesToLexical } from '@lexical/yjs';
import { auth } from '@repo/auth/auth';
import type * as crossws from 'crossws';
import { Window } from 'happy-dom';
import { $createParagraphNode, $getRoot } from 'lexical';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { Binary, ObjectId } from 'mongodb';
import { defineWebSocketHandler } from 'nitro/h3';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

import type { Layer } from '~/lib/types';
import { collections } from '~/server/collections';

const messageSync = 0;
const messageAwareness = 1;
const SYNC_INTERVAL_MS = 1000;
const YJS_DEBUG = process.env.YJS_DEBUG === 'true';
const LEXICAL_NAMESPACE = 'Gemma Shop Text Bonanza';

type TextLayer = Extract<Layer, { type: 'text' }>;

type AwarenessChanges = {
    added: number[];
    updated: number[];
    removed: number[];
};

type DocScope = {
    projectId: string;
    commitId: string;
    slideId: string;
    layerId: number;
};

type BridgePayload = {
    projectId: string;
    commitId: string;
    slideId: string;
    layerId: number;
    textHtml: string;
    fallbackLayer?: TextLayer;
};

interface Persistence {
    bindState: (scope: string, doc: SharedDoc) => Promise<boolean>;
    writeState: (scope: string, doc: SharedDoc) => Promise<void>;
    provider: unknown;
}

type NoopProvider = {
    awareness: {
        getLocalState: () => null;
        getStates: () => Map<number, unknown>;
        off: (_type: 'update', _cb: () => void) => void;
        on: (_type: 'update', _cb: () => void) => void;
        setLocalState: (_state: unknown) => void;
        setLocalStateField: (_field: string, _value: unknown) => void;
    };
    connect: () => void;
    disconnect: () => void;
    off: (
        _type: 'sync' | 'update' | 'status' | 'reload',
        _cb: (...args: unknown[]) => void
    ) => void;
    on: (_type: 'sync' | 'update' | 'status' | 'reload', _cb: (...args: unknown[]) => void) => void;
};

const lexicalWindow = new Window();

function debugLog(...args: unknown[]) {
    if (YJS_DEBUG) console.log('[YJS]', ...args);
}

function sha1(input: string): string {
    return createHash('sha1').update(input).digest('hex');
}

function withLexicalDomGlobals<T>(fn: () => T): T {
    const g = globalThis as any;
    const previous = {
        window: g.window,
        document: g.document,
        Document: g.Document,
        Node: g.Node,
        HTMLElement: g.HTMLElement
    };
    g.window = lexicalWindow;
    g.document = lexicalWindow.document;
    g.Document = lexicalWindow.Document;
    g.Node = lexicalWindow.Node;
    g.HTMLElement = lexicalWindow.HTMLElement;
    try {
        return fn();
    } finally {
        g.window = previous.window;
        g.document = previous.document;
        g.Document = previous.Document;
        g.Node = previous.Node;
        g.HTMLElement = previous.HTMLElement;
    }
}

function createNoopProvider(): NoopProvider {
    return {
        awareness: {
            getLocalState: () => null,
            getStates: () => new Map(),
            off: () => {},
            on: () => {},
            setLocalState: () => {},
            setLocalStateField: () => {}
        },
        connect: () => {},
        disconnect: () => {},
        off: () => {},
        on: () => {}
    };
}

function getDocName(peer: crossws.Peer): string {
    const rawUrl = peer.request?.url;
    if (!rawUrl) throw new Error('Peer URL missing');
    const url = new URL(rawUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 0) throw new Error('Invalid YJS doc path');
    if (parts[0] === 'yjs' && parts.length > 1) {
        return decodeURIComponent(parts.slice(1).join('/'));
    }
    return decodeURIComponent(parts.join('/'));
}

function parseScope(docName: string): DocScope {
    const parts = docName.split('_');
    if (parts.length !== 4) {
        throw new Error(`Invalid docName format: ${docName}`);
    }
    const [projectId, commitId, slideId, layerIdRaw] = parts;
    if (!ObjectId.isValid(projectId) || !ObjectId.isValid(commitId)) {
        throw new Error(`Invalid projectId/commitId in docName: ${docName}`);
    }
    const layerId = Number.parseInt(layerIdRaw, 10);
    if (!Number.isInteger(layerId)) {
        throw new Error(`Invalid numeric layerId in docName: ${docName}`);
    }
    return { projectId, commitId, slideId, layerId };
}

function canUserEditProject(
    project: { collaborators?: Array<{ email?: string; role?: string }> },
    userEmail: string
): boolean {
    const collaborators = Array.isArray(project.collaborators) ? project.collaborators : [];
    const collab = collaborators.find((c) => c.email === userEmail);
    if (!collab) return false;
    return collab.role !== 'viewer';
}

async function requireProjectEditor(peer: crossws.Peer, scope: DocScope, docName: string) {
    const cache = ((peer as any)._ycauthScopes ??= new Set<string>()) as Set<string>;
    if (cache.has(docName)) return;

    const headers = peer.request?.headers;
    if (!headers) {
        throw new Error('YJS auth denied: missing request headers');
    }

    const session = await auth.api.getSession({ headers });
    const userEmail = session?.user?.email;
    if (!userEmail) {
        throw new Error('YJS auth denied: missing user session');
    }

    const project = await collections.projects.findOne(
        { _id: new ObjectId(scope.projectId), deletedAt: { $exists: false } },
        { projection: { collaborators: 1 } }
    );
    if (!project) {
        throw new Error(`YJS auth denied: project ${scope.projectId} not found`);
    }

    if (!canUserEditProject(project as any, userEmail)) {
        throw new Error(
            `YJS auth denied: user ${userEmail} is not ProjectEditor for ${scope.projectId}`
        );
    }

    cache.add(docName);
}

function binaryToUint8Array(data: unknown): Uint8Array | null {
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

async function delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function htmlToYUpdate(html: string, docName: string): Promise<Uint8Array> {
    const doc = new Y.Doc();
    const docMap = new Map<string, Y.Doc>([[docName, doc]]);
    const provider = createNoopProvider();
    const editor = createHeadlessEditor({ namespace: LEXICAL_NAMESPACE, nodes: [] });
    const binding = createBinding(editor, provider as any, docName, doc, docMap);

    const unobserve = editor.registerUpdateListener(
        ({ prevEditorState, editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags }) => {
            syncLexicalUpdateToYjs(
                binding,
                provider as any,
                prevEditorState,
                editorState,
                dirtyElements,
                dirtyLeaves,
                normalizedNodes,
                tags
            );
        }
    );

    withLexicalDomGlobals(() => {
        const parser = new lexicalWindow.DOMParser();
        const dom = parser.parseFromString(html || '<p></p>', 'text/html');
        editor.update(() => {
            const root = $getRoot();
            root.clear();
            const nodes = $generateNodesFromDOM(editor, dom as unknown as Document);
            if (nodes.length === 0) {
                root.append($createParagraphNode());
            } else {
                root.append(...nodes);
            }
        });
    });

    await delay(0);
    unobserve();
    binding.root.destroy(binding as any);
    return Y.encodeStateAsUpdate(doc);
}

async function yDocToHtml(doc: Y.Doc, docName: string): Promise<string> {
    const sourceUpdate = Y.encodeStateAsUpdate(doc);
    const tempDoc = new Y.Doc();
    const docMap = new Map<string, Y.Doc>([[docName, tempDoc]]);
    const provider = createNoopProvider();
    const editor = createHeadlessEditor({ namespace: LEXICAL_NAMESPACE, nodes: [] });
    const binding = createBinding(editor, provider as any, docName, tempDoc, docMap);

    const observer = (events: any[], transaction: Y.Transaction) => {
        syncYjsChangesToLexical(
            binding,
            provider as any,
            events as any,
            transaction.origin instanceof Y.UndoManager
        );
    };

    binding.root.getSharedType().observeDeep(observer);
    Y.applyUpdate(tempDoc, sourceUpdate);
    await delay(0);
    binding.root.getSharedType().unobserveDeep(observer);

    const html = withLexicalDomGlobals(() => {
        let out = '';
        editor.getEditorState().read(() => {
            out = $generateHtmlFromNodes(editor);
        });
        return out;
    });

    binding.root.destroy(binding as any);
    return html || '<p></p>';
}

async function applyHtmlToDoc(doc: Y.Doc, html: string, docName: string) {
    const update = await htmlToYUpdate(html, docName);
    Y.applyUpdate(doc, update);
}

async function loadTextLayer(scope: DocScope): Promise<TextLayer> {
    const commit = await collections.commits.findOne({
        _id: new ObjectId(scope.commitId),
        projectId: new ObjectId(scope.projectId)
    });
    if (!commit?.content?.slides || !Array.isArray(commit.content.slides)) {
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

class MongoYDocPersistence implements Persistence {
    provider: unknown = null;
    private collection = collections.ydocs;
    private indexReady: Promise<void>;

    constructor() {
        this.indexReady = this.collection
            .createIndex({ scope: 1 }, { unique: true, name: 'scope_unique' })
            .then(() => {
                debugLog('ydocs.scope unique index ensured');
            })
            .catch((err) => {
                console.error('[YJS] Failed to ensure ydocs.scope unique index:', err);
            });
    }

    async bindState(scope: string, doc: SharedDoc): Promise<boolean> {
        await this.indexReady;
        const existing = await this.collection.findOne({ scope }, { projection: { data: 1 } });
        if (!existing) return false;
        const update = binaryToUint8Array(existing.data);
        if (!update || update.byteLength === 0) return false;
        Y.applyUpdate(doc, update);
        return true;
    }

    async writeState(scope: string, doc: SharedDoc): Promise<void> {
        await this.indexReady;
        const update = Y.encodeStateAsUpdate(doc);
        await this.collection.updateOne(
            { scope },
            {
                $set: {
                    scope,
                    data: new Binary(Buffer.from(update)),
                    updatedAt: new Date().toISOString()
                },
                $setOnInsert: {
                    createdAt: new Date().toISOString()
                }
            },
            { upsert: true }
        );
    }
}

class SharedDoc extends Y.Doc {
    name: string;
    yc: YCrossws;
    scope: DocScope;
    awareness: awarenessProtocol.Awareness;
    peerIds: Map<crossws.Peer, Set<number>> = new Map();
    dirty = false;
    syncTimer: ReturnType<typeof setInterval> | null = null;
    flushPromise: Promise<void> | null = null;
    lastHtmlHash: string | null = null;
    fallbackLayer: TextLayer | null = null;

    constructor(name: string, scope: DocScope, yc: YCrossws) {
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

    onAwarenessUpdate(changes: AwarenessChanges, peer?: crossws.Peer) {
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

class YCrossws {
    persistence: Persistence;
    docs: Map<string, SharedDoc> = new Map();
    initializing: Map<string, Promise<SharedDoc>> = new Map();

    constructor() {
        this.persistence = new MongoYDocPersistence();
    }

    async onOpen(peer: crossws.Peer) {
        try {
            const doc = await this.getDoc(peer);
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, messageSync);
            syncProtocol.writeSyncStep1(encoder, doc);
            peer.send(encoding.toUint8Array(encoder));

            const awarenessStates = doc.awareness.getStates();
            if (awarenessStates.size > 0) {
                const awarenessEncoder = encoding.createEncoder();
                encoding.writeVarUint(awarenessEncoder, messageAwareness);
                encoding.writeVarUint8Array(
                    awarenessEncoder,
                    awarenessProtocol.encodeAwarenessUpdate(doc.awareness, [
                        ...awarenessStates.keys()
                    ])
                );
                peer.send(encoding.toUint8Array(awarenessEncoder));
            }
        } catch (error) {
            console.error('[YJS] Failed to open peer:', error);
            peer.close();
        }
    }

    async onMessage(peer: crossws.Peer, message: crossws.Message) {
        let doc: SharedDoc;
        try {
            doc = await this.getDoc(peer);
        } catch (error) {
            console.error('[YJS] Failed to resolve doc on message:', error);
            peer.close();
            return;
        }

        try {
            const encoder = encoding.createEncoder();
            const data = message.uint8Array();
            const decoder = decoding.createDecoder(data);
            const messageType = decoding.readVarUint(decoder);
            switch (messageType) {
                case messageSync: {
                    encoding.writeVarUint(encoder, messageSync);
                    syncProtocol.readSyncMessage(decoder, encoder, doc, peer);
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
            // @ts-expect-error yjs event typing
            doc.emit('error', [error]);
        }
    }

    async onClose(peer: crossws.Peer) {
        const doc = (peer as any)._ycdoc as SharedDoc | undefined;
        if (!doc) return;
        if (!doc.peerIds.has(peer)) return;

        const controlledIds = doc.peerIds.get(peer) || [];
        doc.peerIds.delete(peer);
        awarenessProtocol.removeAwarenessStates(doc.awareness, [...controlledIds], undefined);

        if (doc.peerIds.size === 0) {
            doc.stopSyncLoop();
            await this.flushDoc(doc);
            await this.persistence.writeState(doc.name, doc).catch((err) => {
                console.error('[YJS] Failed to persist doc on close:', err);
            });
            doc.destroy();
            this.docs.delete(doc.name);
        }
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

    async flushDoc(doc: SharedDoc): Promise<void> {
        if (!doc.dirty) return;
        if (doc.flushPromise) {
            await doc.flushPromise;
            return;
        }

        doc.flushPromise = (async () => {
            doc.dirty = false;
            await this.persistence.writeState(doc.name, doc);

            const html = await yDocToHtml(doc, doc.name);
            const nextHash = sha1(html);
            if (doc.lastHtmlHash === nextHash) return;
            doc.lastHtmlHash = nextHash;

            const payload: BridgePayload = {
                projectId: doc.scope.projectId,
                commitId: doc.scope.commitId,
                slideId: doc.scope.slideId,
                layerId: doc.scope.layerId,
                textHtml: html,
                fallbackLayer: doc.fallbackLayer ?? undefined
            };

            const sent = await (process as any).__YJS_UPSERT_LAYER__?.(payload);
            debugLog('flushDoc', doc.name, { sent, hash: nextHash });
        })()
            .catch((error) => {
                console.error('[YJS] flushDoc failed:', error);
                doc.dirty = true;
            })
            .finally(() => {
                doc.flushPromise = null;
            });

        await doc.flushPromise;
    }

    private async createDoc(docName: string): Promise<SharedDoc> {
        const scope = parseScope(docName);
        const doc = new SharedDoc(docName, scope, this);
        doc.gc = true;
        this.docs.set(docName, doc);

        try {
            const layer = await loadTextLayer(scope);
            doc.fallbackLayer = layer;

            const hydrated = await this.persistence.bindState(docName, doc);
            if (!hydrated) {
                await applyHtmlToDoc(doc, layer.textHtml, docName);
                doc.dirty = true;
                await this.flushDoc(doc);
            }
            doc.startSyncLoop();
            return doc;
        } catch (error) {
            this.docs.delete(docName);
            doc.stopSyncLoop();
            doc.destroy();
            throw error;
        }
    }

    async getDoc(peer: crossws.Peer): Promise<SharedDoc> {
        if ((peer as any)._ycdoc) return (peer as any)._ycdoc;

        const docName = getDocName(peer);
        const scope = parseScope(docName);
        await requireProjectEditor(peer, scope, docName);
        let doc = this.docs.get(docName);
        if (!doc) {
            let pending = this.initializing.get(docName);
            if (!pending) {
                pending = this.createDoc(docName);
                this.initializing.set(docName, pending);
            }
            try {
                doc = await pending;
            } finally {
                this.initializing.delete(docName);
            }
        }

        if (!doc.peerIds.has(peer)) doc.peerIds.set(peer, new Set());
        (peer as any)._ycdoc = doc;
        return doc;
    }

    revalidateProject(projectId: string): number {
        let closed = 0;
        for (const doc of this.docs.values()) {
            if (doc.scope.projectId !== projectId) continue;
            for (const peer of doc.peerIds.keys()) {
                try {
                    peer.close();
                    closed += 1;
                } catch {
                    // no-op
                }
            }
        }
        return closed;
    }
}

function createHandler(yc: YCrossws) {
    const hooks: Partial<crossws.Hooks> = {
        async open(peer) {
            await yc.onOpen(peer);
        },
        async message(peer, message) {
            await yc.onMessage(peer, message);
        },
        async close(peer) {
            await yc.onClose(peer);
        }
    };
    return { hooks: hooks as crossws.Hooks };
}

const yCrossws = new YCrossws();

(process as any).__YJS_REVALIDATE_PROJECT__ = (projectId: string) => {
    return yCrossws.revalidateProject(projectId);
};

export default defineWebSocketHandler(createHandler(yCrossws).hooks);
