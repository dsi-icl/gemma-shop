import { db } from '@repo/db';
import type { Peer } from 'crossws';
import { ObjectId } from 'mongodb';

import {
    makeScopeKey,
    type GSMessage,
    type Layer,
    type ScopeKey,
    type ScopeState
} from '~/lib/types';

// ── Peer metadata (discriminated by specimen) ────────────────────────────────

export type PeerMeta =
    | { specimen: 'editor'; projectId: string; slideId: string; scopeKey: ScopeKey }
    | { specimen: 'wall'; wallId: string }
    | { specimen: 'controller'; wallId: string }
    | { specimen: 'roy' };

export interface PeerEntry {
    peer: Peer;
    meta: PeerMeta;
}

// ── State stores ─────────────────────────────────────────────────────────────

/** Master peer registry: peerId → { peer, meta } */
export const peers = new Map<string, PeerEntry>();

/** Editor scope index: scopeKey → Set<peerId> */
export const editorsByScope = new Map<ScopeKey, Set<string>>();

/** Wall scope index: wallId → Set<peerId> */
export const wallsByWallId = new Map<string, Set<string>>();

/** Controller scope index: wallId → Set<peerId> */
export const controllersByWallId = new Map<string, Set<string>>();

/** wallId → scopeKey: which content a wall displays */
export const wallBindings = new Map<string, ScopeKey>();

/** scopeKey → Set<wallId>: reverse index for "which walls watch this scope?" */
export const scopeWatchers = new Map<ScopeKey, Set<string>>();

/** Scope-keyed stage state (HMR-safe) */
export const scopedState: Map<ScopeKey, ScopeState> =
    process.__SCOPED_STAGE_STATE__ ?? new Map<ScopeKey, ScopeState>();
process.__SCOPED_STAGE_STATE__ = scopedState;

// ── Index helpers ────────────────────────────────────────────────────────────

function addToIndex(index: Map<string, Set<string>>, key: string, peerId: string) {
    let set = index.get(key);
    if (!set) {
        set = new Set();
        index.set(key, set);
    }
    set.add(peerId);
}

function removeFromIndex(index: Map<string, Set<string>>, key: string, peerId: string) {
    const set = index.get(key);
    if (set) {
        set.delete(peerId);
        if (set.size === 0) index.delete(key);
    }
}

// ── Peer registration ────────────────────────────────────────────────────────

export function registerPeer(peer: Peer, meta: PeerMeta) {
    peers.set(peer.id, { peer, meta });

    switch (meta.specimen) {
        case 'editor':
            addToIndex(editorsByScope, meta.scopeKey, peer.id);
            break;
        case 'wall':
            addToIndex(wallsByWallId, meta.wallId, peer.id);
            break;
        case 'controller':
            addToIndex(controllersByWallId, meta.wallId, peer.id);
            break;
        case 'roy':
            break;
    }
}

export function unregisterPeer(peerId: string): PeerMeta | null {
    const entry = peers.get(peerId);
    if (!entry) return null;

    const { meta } = entry;
    switch (meta.specimen) {
        case 'editor':
            removeFromIndex(editorsByScope, meta.scopeKey, peerId);
            break;
        case 'wall':
            removeFromIndex(wallsByWallId, meta.wallId, peerId);
            break;
        case 'controller':
            removeFromIndex(controllersByWallId, meta.wallId, peerId);
            break;
        case 'roy':
            break;
    }

    peers.delete(peerId);
    return meta;
}

// ── Scope state ──────────────────────────────────────────────────────────────

export function getOrCreateScope(
    scopeKey: ScopeKey,
    projectId: string,
    slideId: string
): ScopeState {
    let scope = scopedState.get(scopeKey);
    if (!scope) {
        scope = { layers: new Map(), projectId, slideId, dirty: false };
        scopedState.set(scopeKey, scope);
    }
    return scope;
}

// ── Wall bindings ────────────────────────────────────────────────────────────

export function bindWall(wallId: string, scopeKey: ScopeKey) {
    // Remove old binding if exists
    const oldScope = wallBindings.get(wallId);
    if (oldScope) {
        const watchers = scopeWatchers.get(oldScope);
        if (watchers) {
            watchers.delete(wallId);
            if (watchers.size === 0) scopeWatchers.delete(oldScope);
        }
    }

    wallBindings.set(wallId, scopeKey);
    let watchers = scopeWatchers.get(scopeKey);
    if (!watchers) {
        watchers = new Set();
        scopeWatchers.set(scopeKey, watchers);
    }
    watchers.add(wallId);
}

export function unbindWall(wallId: string) {
    const oldScope = wallBindings.get(wallId);
    if (oldScope) {
        const watchers = scopeWatchers.get(oldScope);
        if (watchers) {
            watchers.delete(wallId);
            if (watchers.size === 0) scopeWatchers.delete(oldScope);
        }
    }
    wallBindings.delete(wallId);
}

// ── Broadcast helpers ────────────────────────────────────────────────────────

export function sendJSON(peer: Peer, data: GSMessage) {
    peer.send(JSON.stringify(data));
}

export function broadcastToEditors(scopeKey: ScopeKey, data: GSMessage, excludePeerId?: string) {
    const payload = JSON.stringify(data);
    const peerIds = editorsByScope.get(scopeKey);
    if (!peerIds) return;
    for (const id of peerIds) {
        if (id === excludePeerId) continue;
        peers.get(id)?.peer.send(payload);
    }
}

export function broadcastToWalls(scopeKey: ScopeKey, data: GSMessage) {
    const payload = JSON.stringify(data);
    const watchingWallIds = scopeWatchers.get(scopeKey);
    if (!watchingWallIds) return;
    for (const wallId of watchingWallIds) {
        const wallPeerIds = wallsByWallId.get(wallId);
        if (!wallPeerIds) continue;
        for (const id of wallPeerIds) {
            peers.get(id)?.peer.send(payload);
        }
    }
}

export function broadcastToWallsBinary(scopeKey: ScopeKey, data: ArrayBuffer) {
    const watchingWallIds = scopeWatchers.get(scopeKey);
    if (!watchingWallIds) return;
    for (const wallId of watchingWallIds) {
        const wallPeerIds = wallsByWallId.get(wallId);
        if (!wallPeerIds) continue;
        for (const id of wallPeerIds) {
            peers.get(id)?.peer.send(data);
        }
    }
}

/** Broadcast to all editors in scope + all walls watching this scope */
export function broadcastToScope(scopeKey: ScopeKey, data: GSMessage, excludePeerId?: string) {
    broadcastToEditors(scopeKey, data, excludePeerId);
    broadcastToWalls(scopeKey, data);
}

/** Hydrate all wall nodes for a given wallId with their bound scope's layers */
export function hydrateWallNodes(wallId: string) {
    const scopeKey = wallBindings.get(wallId);
    const layers = scopeKey ? Array.from(scopedState.get(scopeKey)?.layers.values() ?? []) : [];

    const payload = JSON.stringify({ type: 'hydrate', layers });
    const wallPeerIds = wallsByWallId.get(wallId);
    if (!wallPeerIds) return;
    for (const id of wallPeerIds) {
        peers.get(id)?.peer.send(payload);
    }
}

/** Notify all controllers for a wallId about binding status */
export function notifyControllers(
    wallId: string,
    bound: boolean,
    projectId?: string,
    slideId?: string
) {
    const controllerIds = controllersByWallId.get(wallId);
    if (!controllerIds) return;

    const status: GSMessage = {
        type: 'wall_binding_status',
        wallId,
        bound,
        ...(projectId ? { projectId } : {}),
        ...(slideId ? { slideId } : {})
    };
    for (const id of controllerIds) {
        const ctrl = peers.get(id);
        if (ctrl) sendJSON(ctrl.peer, status);
    }
}

// ── Logging ──────────────────────────────────────────────────────────────────

export function logPeerCounts() {
    let editors = 0;
    let walls = 0;
    let controllers = 0;
    let roys = 0;
    for (const { meta } of peers.values()) {
        switch (meta.specimen) {
            case 'editor':
                editors++;
                break;
            case 'wall':
                walls++;
                break;
            case 'controller':
                controllers++;
                break;
            case 'roy':
                roys++;
                break;
        }
    }
    console.log(
        `[WS] Peers: ${editors} editors, ${walls} walls, ${controllers} controllers, ${roys} roys`
    );
}

// ── Save to MongoDB ─────────────────────────────────────────────────────────

export async function buildSlidesSnapshot(
    scope: ScopeState,
    headCommitId: ObjectId | string | null
): Promise<Array<{ id: string; order: number; layers: Layer[] }>> {
    let existingSlides: Array<{ id: string; order: number; layers: Layer[] }> = [];

    if (headCommitId) {
        const headCommit = await db
            .collection('commits')
            .findOne({ _id: new ObjectId(headCommitId) });
        if (headCommit?.content?.slides) {
            existingSlides = headCommit.content.slides;
        }
    }

    const currentLayers = Array.from(scope.layers.values());
    let slideFound = false;
    const updatedSlides = existingSlides.map((slide) => {
        if (slide.id === scope.slideId) {
            slideFound = true;
            return { ...slide, layers: currentLayers };
        }
        return slide;
    });

    if (!slideFound) {
        updatedSlides.push({
            id: scope.slideId,
            order: updatedSlides.length,
            layers: currentLayers
        });
    }

    return updatedSlides;
}

export async function saveScope(
    scopeKey: ScopeKey,
    message: string,
    isAutoSave: boolean
): Promise<{ success: boolean; commitId?: string; error?: string }> {
    const scope = scopedState.get(scopeKey);
    if (!scope) return { success: false, error: 'Scope not found' };

    const projectId = new ObjectId(scope.projectId);

    try {
        const project = await db.collection('projects').findOne({ _id: projectId });
        if (!project) return { success: false, error: 'Project not found' };

        const headId = project.headCommitId ? new ObjectId(project.headCommitId) : null;
        const updatedSlides = await buildSlidesSnapshot(scope, headId);

        if (isAutoSave) {
            const filter = {
                projectId,
                isAutoSave: true,
                ...(headId ? { parentId: headId } : { parentId: null })
            };

            await db.collection('commits').updateOne(
                filter,
                {
                    $set: {
                        message,
                        content: { slides: updatedSlides },
                        isAutoSave: true,
                        updatedAt: new Date()
                    },
                    $setOnInsert: {
                        projectId,
                        parentId: headId,
                        authorId: new ObjectId(), // TODO: session user
                        createdAt: new Date()
                    }
                },
                { upsert: true }
            );

            scope.dirty = false;
            return { success: true };
        }

        const newCommit = {
            projectId,
            parentId: headId,
            authorId: new ObjectId(), // TODO: session user
            message,
            content: { slides: updatedSlides },
            isAutoSave: false,
            createdAt: new Date()
        };

        const result = await db.collection('commits').insertOne(newCommit);

        await db
            .collection('projects')
            .updateOne(
                { _id: projectId },
                { $set: { headCommitId: result.insertedId, updatedAt: new Date() } }
            );

        if (headId) {
            await db.collection('commits').deleteMany({
                projectId,
                isAutoSave: true,
                parentId: headId
            });
        }

        scope.dirty = false;
        return { success: true, commitId: result.insertedId.toHexString() };
    } catch (err) {
        console.error('[Bus] saveScope failed:', err);
        return { success: false, error: String(err) };
    }
}

/** Resolve the scope key for a sender peer (editors directly, walls/controllers via binding) */
export function resolveScopeKey(meta: PeerMeta): ScopeKey | null {
    switch (meta.specimen) {
        case 'editor':
            return meta.scopeKey;
        case 'wall':
        case 'controller':
            return wallBindings.get(meta.wallId) ?? null;
        default:
            return null;
    }
}
