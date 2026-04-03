import { randomBytes } from 'node:crypto';

import { createFileRoute } from '@tanstack/react-router';
import { defineHooks, type Peer } from 'crossws';
import { ObjectId } from 'mongodb';

import {
    peers,
    scopedState,
    wallBindings,
    wallBindingSources,
    wallsByWallId,
    editorsByScope,
    allEditors,
    activeVideos,
    registerPeer,
    unregisterPeer,
    setEditorScope,
    getOrCreateScope,
    internScope,
    scopeLabel,
    bindWall,
    scheduleWallUnbindGrace,
    unbindWall,
    sendJSON,
    broadcastToEditors,
    broadcastToControllersByScopeRaw,
    broadcastToWallsBinary,
    broadcastToControllersByWallRaw,
    broadcastToScope,
    broadcastToScopeRaw,
    broadcastToWallNodesRaw,
    broadcastToWallsRaw,
    hydrateWallNodes,
    notifyControllers,
    logPeerCounts,
    seedScopeFromDb,
    saveScope,
    resolveScopeId,
    registerActiveVideo,
    unregisterActiveVideo,
    clearActiveVideosForScope,
    // recomputeLayerNodes,
    // recomputeAllLayerNodes,
    sendVideoSyncToRelevantWalls,
    broadcastVideoSyncBatchToWalls,
    // deleteLayerNodes,
    // clearLayerNodesForScope,
    clearControllerTransientForScope,
    deleteControllerTransientLayerForScope,
    deleteControllerTransientLayer,
    invalidateHydrateCache,
    getEditorHydratePayload,
    getWallHydratePayload,
    upsertControllerTransientLayer,
    cancelWallUnbindGrace,
    touchPing,
    reapStalePeers,
    persistSlideMetadata,
    deleteYDocForLayer,
    broadcastToEditorsByCommit,
    notifyControllersByCommit,
    broadcastAssetToEditorsByProject,
    getWallNodeCount,
    galleriesByWallId,
    allGalleries,
    markIncomingBinary,
    markIncomingJson,
    estimatePlaybackLeadMs,
    // layerNodes,
    // canSendNonCritical,
    EMPTY_HYDRATE,
    type PeerEntry
} from '~/lib/busState';
import { validatePortalToken } from '~/lib/portalTokens';
import {
    HelloSchema,
    GSMessageSchema,
    makeScopeLabel,
    type GSMessage,
    type Layer
} from '~/lib/types';
import { logAuditDenied } from '~/server/audit';
import { collections } from '~/server/collections';
import { ensureDeviceByPublicKey, markDeviceDisconnectedById } from '~/server/devices';
import {
    buildRateLimitSubjectKey,
    checkRateLimit,
    getClientIpFromHeaders
} from '~/server/rateLimit';
import { resolveAuthContextFromRequest, type AuthContext } from '~/server/requestAuthContext';

// ── Binary opcodes ──────────────────────────────────────────────────────────

const OP = {
    SPATIAL_MOVE: 0x05,
    CLOCK_PING: 0x08,
    CLOCK_PONG: 0x09,
    // Reserved for future binary migration
    UPSERT_LAYER: 0x10,
    DELETE_LAYER: 0x11,
    VIDEO_PLAY: 0x12,
    VIDEO_PAUSE: 0x13,
    VIDEO_SEEK: 0x14,
    VIDEO_SYNC: 0x15
} as const;

const pongBuf = new ArrayBuffer(25);
const pongView = new DataView(pongBuf);
pongView.setUint8(0, OP.CLOCK_PONG);

function hasType(raw: unknown): raw is { type: string; [k: string]: unknown } {
    return typeof raw === 'object' && raw !== null && typeof (raw as any).type === 'string';
}

function toArrayBufferView(data: Uint8Array | Buffer): ArrayBuffer {
    const out = new Uint8Array(data.byteLength);
    out.set(data);
    return out.buffer;
}

function firstNonWhitespaceByte(data: Uint8Array): number | null {
    for (let i = 0; i < data.byteLength; i++) {
        const c = data[i];
        // ASCII whitespace: tab, lf, cr, space
        if (c === 0x09 || c === 0x0a || c === 0x0d || c === 0x20) continue;
        return c;
    }
    return null;
}

interface HandlerCtx {
    entry: PeerEntry;
    data: Record<string, any>;
    scopeId: number | null;
    rawText: string;
}

type Handler = (ctx: HandlerCtx) => void;

const handlers = new Map<string, Handler>();
const lastPlaybackCommandAt = new Map<string, number>();

const BIND_OVERRIDE_TIMEOUT_MS = 20_000;

interface PendingBindOverride {
    requestId: string;
    requesterPeerId: string;
    wallId: string;
    projectId: string;
    commitId: string;
    slideId: string;
    timer: ReturnType<typeof setTimeout>;
}

const pendingBindOverrides = new Map<string, PendingBindOverride>();
const pendingBindOverrideByWall = new Map<string, string>();
type HelloMessage = Extract<GSMessage, { type: 'hello' }>;
type DeviceHelloMessage = Exclude<HelloMessage, { specimen: 'editor' }>;
type HelloChallengeMessage = Extract<GSMessage, { type: 'hello_challenge' }>;

interface PendingHelloAuth {
    hello: DeviceHelloMessage;
    nonce: string;
}

const pendingHelloAuthByPeer = new Map<string, PendingHelloAuth>();
const wsRateLimitStrikes = new Map<string, number>();
const WS_RATE_LIMIT_STRIKE_LIMIT = Math.max(
    1,
    Number(process.env.WS_RATE_LIMIT_STRIKE_LIMIT ?? '5')
);

function playbackCommandKey(scopeId: number, numericId: number): string {
    return `${scopeId}:${numericId}`;
}

function shouldApplyPlaybackCommand(
    scopeId: number,
    numericId: number,
    issuedAt: unknown
): boolean {
    const now = Date.now();
    const fromClient = typeof issuedAt === 'number' && Number.isFinite(issuedAt) ? issuedAt : null;
    // Protect against cross-device clock skew: trust client timestamp only if it is near server now.
    const stamp = fromClient !== null && Math.abs(fromClient - now) <= 15_000 ? fromClient : now;
    const key = playbackCommandKey(scopeId, numericId);
    const prev = lastPlaybackCommandAt.get(key);
    if (prev !== undefined && stamp < prev) return false;
    lastPlaybackCommandAt.set(key, stamp);
    return true;
}

function clearPlaybackCommand(scopeId: number, numericId: number) {
    lastPlaybackCommandAt.delete(playbackCommandKey(scopeId, numericId));
}

const WS_MUTATION_MESSAGE_TYPES = new Set([
    'clear_stage',
    'upsert_layer',
    'delete_layer',
    'seed_scope',
    'update_slides',
    'reboot',
    'stage_dirty',
    'stage_save',
    'switch_scope',
    'bind_wall',
    'request_bind_wall',
    'bind_override_decision',
    'unbind_wall',
    'video_play',
    'video_pause',
    'video_seek'
]);

// TODO Review if authed logic is waranted here
function getWsRateLimitIdentity(peer: Peer): string {
    const ip = getClientIpFromHeaders(peer.request?.headers as Headers | undefined);

    return buildRateLimitSubjectKey({
        ip,
        peerId: peer.id
    });
}

function getEntryProjectId(entry: PeerEntry): string | null {
    const meta = entry.meta;
    if (meta.specimen === 'editor') return meta.scope?.projectId ?? null;
    if (meta.specimen === 'wall' || meta.specimen === 'controller') {
        const scopeId = wallBindings.get(meta.wallId);
        const scope = scopeId !== undefined ? scopedState.get(scopeId) : null;
        return scope?.projectId ?? null;
    }
    if (meta.specimen === 'gallery' && meta.wallId) {
        const scopeId = wallBindings.get(meta.wallId);
        const scope = scopeId !== undefined ? scopedState.get(scopeId) : null;
        return scope?.projectId ?? null;
    }
    return null;
}

async function enforceWsRateLimit(
    peer: Peer,
    messageType: string,
    opts?: { entry?: PeerEntry; projectId?: string | null }
): Promise<boolean> {
    if (!WS_MUTATION_MESSAGE_TYPES.has(messageType)) return true;

    const subjectKey = getWsRateLimitIdentity(peer);
    const result = checkRateLimit({
        subjectKey
    });

    if (result.allowed) {
        wsRateLimitStrikes.set(peer.id, 0);
        return true;
    }

    const nextStrikes = (wsRateLimitStrikes.get(peer.id) ?? 0) + 1;
    wsRateLimitStrikes.set(peer.id, nextStrikes);

    // TODO See if we target more explicit user/identified devices
    const actorId = peer.id;
    void logAuditDenied({
        action: 'WS_MESSAGE_RATE_LIMITED',
        actorId,
        projectId: opts?.projectId ?? (opts?.entry ? getEntryProjectId(opts.entry) : null),
        resourceType: 'ws_message',
        resourceId: messageType,
        reasonCode: 'RATE_LIMITED',
        changes: { retryAfterMs: result.retryAfterMs, strikes: nextStrikes }
    });

    peer.send(
        JSON.stringify({
            type: 'rate_limited',
            messageType,
            retryAfterMs: result.retryAfterMs
        })
    );

    if (nextStrikes >= WS_RATE_LIMIT_STRIKE_LIMIT) {
        try {
            peer.close();
        } catch {
            // no-op
        }
    }
    return false;
}

async function performLiveBind(
    wallId: string,
    projectId: string,
    commitId: string,
    requestedSlideId: string,
    source: 'live' | 'gallery' = 'live'
): Promise<{ ok: boolean; resolvedSlideId?: string; error?: string }> {
    try {
        cancelWallUnbindGrace(wallId);
        const [resolvedSlideId, project, wallExists] = await Promise.all([
            resolveBoundSlideId(projectId, commitId, requestedSlideId),
            collections.projects.findOne(
                { _id: new ObjectId(projectId) },
                {
                    projection: {
                        customRenderUrl: 1,
                        customRenderCompat: 1,
                        customRenderProxy: 1
                    }
                }
            ),
            collections.walls.findOne({ wallId }, { projection: { _id: 1 } })
        ]);
        if (!wallExists) {
            return { ok: false, error: 'unknown_wall' };
        }
        if (!resolvedSlideId) {
            return { ok: false, error: 'invalid_slide' };
        }

        const scopeId = internScope(projectId, commitId, resolvedSlideId);
        const scope = getOrCreateScope(
            scopeId,
            projectId,
            commitId,
            resolvedSlideId,
            project?.customRenderUrl,
            project?.customRenderCompat,
            project?.customRenderProxy
        );
        bindWall(wallId, scopeId, source);

        if (scope.layers.size === 0) {
            await seedScopeFromDb(scopeId);
        }

        notifyControllers(
            wallId,
            true,
            projectId,
            commitId,
            resolvedSlideId,
            scope.customRenderUrl
        );
        try {
            hydrateWallNodes(wallId);
            broadcastToControllersByWallRaw(wallId, getWallHydratePayload(scopeId, wallId));
            void broadcastSlidesSnapshotToControllersByWall(wallId, commitId);
        } catch (err) {
            console.error(
                `[WS] bind_wall hydrate failed for ${wallId} (${makeScopeLabel(projectId, commitId, resolvedSlideId)}):`,
                err
            );
        }

        await collections.walls.updateOne(
            { wallId },
            {
                $set: {
                    boundProjectId: projectId,
                    boundCommitId: commitId,
                    boundSlideId: resolvedSlideId,
                    boundSource: source,
                    updatedAt: new Date().toISOString()
                }
            }
        );

        broadcastWallBindingToEditors(wallId);
        broadcastWallBindingToGalleries(wallId);
        broadcastWallNodeCountToEditors(wallId);

        console.log(
            `[WS] Wall ${wallId} bound to scope=${makeScopeLabel(projectId, commitId, resolvedSlideId)}`
        );
        return { ok: true, resolvedSlideId };
    } catch (err) {
        console.error(
            `[WS] bind_wall failed for ${wallId} (${makeScopeLabel(projectId, commitId, requestedSlideId)}):`,
            err
        );
        return { ok: false, error: 'bind_failed' };
    }
}

function clearPendingBindOverride(requestId: string): PendingBindOverride | null {
    const pending = pendingBindOverrides.get(requestId);
    if (!pending) return null;
    clearTimeout(pending.timer);
    pendingBindOverrides.delete(requestId);
    if (pendingBindOverrideByWall.get(pending.wallId) === requestId) {
        pendingBindOverrideByWall.delete(pending.wallId);
    }
    return pending;
}

function sendBindOverrideResult(
    requesterPeerId: string,
    payload: Extract<GSMessage, { type: 'bind_override_result' }>
) {
    const requester = peers.get(requesterPeerId);
    if (requester) {
        sendJSON(requester.peer, payload);
    }
    const galleries = galleriesByWallId.get(payload.wallId);
    if (galleries) {
        const raw = JSON.stringify(payload);
        for (const gallery of galleries) {
            gallery.peer.send(raw);
        }
    }
}

function broadcastWallNodeCountToEditors(wallId: string) {
    const payload = JSON.stringify({
        type: 'wall_node_count',
        wallId,
        connectedNodes: getWallNodeCount(wallId)
    } satisfies GSMessage);
    for (const entry of allEditors) {
        entry.peer.send(payload);
    }
}

async function resolveBoundSlideId(
    projectId: string,
    commitId: string,
    requestedSlideId: string
): Promise<string | null> {
    let commit: any = null;
    try {
        commit = await collections.commits.findOne(
            { _id: new ObjectId(commitId), projectId: new ObjectId(projectId) },
            { projection: { 'content.slides.id': 1 } }
        );
    } catch {
        return null;
    }
    if (!commit) return null;
    const slides = (commit.content?.slides as Array<{ id?: string }>) ?? [];
    if (slides.some((s) => s.id === requestedSlideId)) return requestedSlideId;
    return slides[0]?.id ?? null;
}

async function getSlidesMetadata(
    commitId: string
): Promise<Array<{ id: string; order: number; name: string }>> {
    try {
        const commit = await collections.commits.findOne(
            { _id: new ObjectId(commitId) },
            { projection: { 'content.slides': 1 } }
        );
        const slides =
            (commit?.content?.slides as Array<{
                id?: string;
                order?: number;
                name?: string;
            }>) ?? [];
        return slides
            .filter(
                (slide): slide is { id: string; order?: number; name?: string } =>
                    typeof slide?.id === 'string'
            )
            .map((slide, index) => ({
                id: slide.id,
                order: typeof slide.order === 'number' ? slide.order : index,
                name:
                    typeof slide.name === 'string' && slide.name.length > 0
                        ? slide.name
                        : String(index + 1)
            }));
    } catch (error) {
        console.warn(`[WS] Failed to read slides metadata for commit ${commitId}:`, error);
        return [];
    }
}

async function sendSlidesSnapshotToControllerPeer(peer: Peer, commitId: string) {
    const slides = await getSlidesMetadata(commitId);
    sendJSON(peer, {
        type: 'slides_updated',
        commitId,
        slides
    });
}

async function broadcastSlidesSnapshotToControllersByWall(wallId: string, commitId: string) {
    const slides = await getSlidesMetadata(commitId);
    broadcastToControllersByWallRaw(
        wallId,
        JSON.stringify({
            type: 'slides_updated',
            commitId,
            slides
        } satisfies GSMessage)
    );
}

function broadcastWallBindingToEditors(wallId: string) {
    const boundScope = wallBindings.get(wallId);
    const scope = boundScope !== undefined ? scopedState.get(boundScope) : null;
    const boundSource = wallBindingSources.get(wallId);
    const payload = JSON.stringify({
        type: 'wall_binding_status',
        wallId,
        bound: boundScope !== undefined,
        ...(scope
            ? {
                  projectId: scope.projectId,
                  commitId: scope.commitId,
                  slideId: scope.slideId,
                  customRenderUrl: scope.customRenderUrl,
                  boundSource
              }
            : {})
    } satisfies GSMessage);
    for (const entry of allEditors) {
        entry.peer.send(payload);
    }
}

function broadcastWallBindingToGalleries(wallId: string) {
    const boundScope = wallBindings.get(wallId);
    const scope = boundScope !== undefined ? scopedState.get(boundScope) : null;
    const payload = JSON.stringify({
        type: 'wall_binding_changed',
        wallId,
        bound: boundScope !== undefined,
        ...(scope
            ? { projectId: scope.projectId, commitId: scope.commitId, slideId: scope.slideId }
            : {}),
        source: wallBindingSources.get(wallId)
    } satisfies GSMessage);
    for (const entry of allGalleries) {
        entry.peer.send(payload);
    }
    if (boundScope === undefined) {
        const unboundPayload = JSON.stringify({ type: 'wall_unbound', wallId } satisfies GSMessage);
        for (const entry of allGalleries) {
            entry.peer.send(unboundPayload);
        }
    }
}

function broadcastProjectPublishChanged(projectId: string, publishedCommitId: string | null) {
    const payload = JSON.stringify({
        type: 'project_publish_changed',
        projectId,
        published: Boolean(publishedCommitId),
        publishedCommitId
    } satisfies GSMessage);
    for (const entry of allGalleries) {
        entry.peer.send(payload);
    }
}

async function sendGalleryStateSnapshot(peer: Peer, wallId?: string) {
    const candidateWallIds = new Set<string>();
    if (wallId) {
        candidateWallIds.add(wallId);
    } else {
        for (const known of wallsByWallId.keys()) candidateWallIds.add(known);
        for (const known of wallBindings.keys()) candidateWallIds.add(known);
    }

    const walls = Array.from(candidateWallIds).map((id) => {
        const boundScope = wallBindings.get(id);
        const scope = boundScope !== undefined ? scopedState.get(boundScope) : null;
        return {
            wallId: id,
            connectedNodes: getWallNodeCount(id),
            bound: boundScope !== undefined,
            ...(scope
                ? {
                      projectId: scope.projectId,
                      commitId: scope.commitId,
                      slideId: scope.slideId,
                      source: wallBindingSources.get(id)
                  }
                : {})
        };
    });

    let publishedProjects: Array<{ projectId: string; publishedCommitId: string | null }> = [];
    try {
        const docs = await collections.projects
            .find(
                { publishedCommitId: { $ne: null }, deletedAt: { $exists: false } },
                { projection: { _id: 1, publishedCommitId: 1 } }
            )
            .toArray();
        publishedProjects = docs.map((doc: any) => ({
            projectId: String(doc._id),
            publishedCommitId: doc.publishedCommitId ? String(doc.publishedCommitId) : null
        }));
    } catch (error) {
        console.warn('[WS] gallery_state: failed to read published projects snapshot', error);
    }

    sendJSON(peer, {
        type: 'gallery_state',
        ...(wallId ? { wallId } : {}),
        walls,
        publishedProjects
    });
}

function clearPendingHelloAuth(peerId: string): PendingHelloAuth | null {
    const pending = pendingHelloAuthByPeer.get(peerId);
    if (!pending) return null;
    pendingHelloAuthByPeer.delete(peerId);
    return pending;
}

function issueHelloChallenge(peer: Peer, hello: DeviceHelloMessage) {
    const pending: PendingHelloAuth = {
        hello,
        nonce: randomBytes(16).toString('base64url')
    };
    pendingHelloAuthByPeer.set(peer.id, pending);
    const challenge: HelloChallengeMessage = {
        type: 'hello_challenge',
        nonce: pending.nonce
    };
    sendJSON(peer, challenge);
}

function base64UrlToBytes(input: string): Uint8Array {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return Uint8Array.from(Buffer.from(padded, 'base64'));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const out = new Uint8Array(bytes.byteLength);
    out.set(bytes);
    return out.buffer;
}

async function verifyDeviceSignature(
    publicKeyRaw: string,
    nonce: string,
    signatureBase64Url: string
): Promise<boolean> {
    try {
        const jwk = JSON.parse(publicKeyRaw) as JsonWebKey;
        const key = await crypto.subtle.importKey(
            'jwk',
            jwk,
            {
                name: 'ECDSA',
                namedCurve: 'P-256'
            },
            false,
            ['verify']
        );
        return crypto.subtle.verify(
            {
                name: 'ECDSA',
                hash: 'SHA-256'
            },
            key,
            asArrayBuffer(base64UrlToBytes(signatureBase64Url)),
            asArrayBuffer(new TextEncoder().encode(nonce))
        );
    } catch (error) {
        console.warn('[WS] Failed to verify device signature', error);
        return false;
    }
}

async function registerEditorPeer(
    peer: Peer,
    scopeInput: {
        projectId: string;
        commitId: string;
        slideId: string;
    }
) {
    const scopeId = internScope(scopeInput.projectId, scopeInput.commitId, scopeInput.slideId);
    const scope = getOrCreateScope(
        scopeId,
        scopeInput.projectId,
        scopeInput.commitId,
        scopeInput.slideId
    );

    const existing = peers.get(peer.id);
    const { authContext } = await resolveAuthContextFromRequest(peer.request);
    if (existing?.meta.specimen === 'editor') {
        setEditorScope(existing, {
            projectId: scopeInput.projectId,
            commitId: scopeInput.commitId,
            slideId: scopeInput.slideId,
            scopeId
        });
    } else {
        registerPeer(peer, {
            specimen: 'editor',
            scope: {
                projectId: scopeInput.projectId,
                commitId: scopeInput.commitId,
                slideId: scopeInput.slideId,
                scopeId
            },
            authContext
        });
    }

    if (scope.layers.size === 0) {
        // Fresh scope — auto-seed from DB so the editor gets layers immediately
        seedScopeFromDb(scopeId).then(() => {
            peer.send(getEditorHydratePayload(scopeId));
            const allWallIds = new Set<string>(wallsByWallId.keys());
            for (const wallId of allWallIds) {
                const assignedConnectedNodes = getWallNodeCount(wallId);
                peer.send(
                    JSON.stringify({
                        type: 'wall_node_count',
                        wallId,
                        connectedNodes: assignedConnectedNodes
                    } satisfies GSMessage)
                );
                const boundScope = wallBindings.get(wallId);
                const bound = boundScope !== undefined;
                const s = bound ? scopedState.get(boundScope) : null;
                peer.send(
                    JSON.stringify({
                        type: 'wall_binding_status',
                        wallId,
                        bound,
                        ...(s
                            ? {
                                  projectId: s.projectId,
                                  commitId: s.commitId,
                                  slideId: s.slideId,
                                  customRenderUrl: s.customRenderUrl,
                                  boundSource: wallBindingSources.get(wallId)
                              }
                            : {})
                    } satisfies GSMessage)
                );
            }
        });
    } else {
        peer.send(getEditorHydratePayload(scopeId));
        const allWallIds = new Set<string>(wallsByWallId.keys());
        for (const wallId of allWallIds) {
            const assignedConnectedNodes = getWallNodeCount(wallId);
            peer.send(
                JSON.stringify({
                    type: 'wall_node_count',
                    wallId,
                    connectedNodes: assignedConnectedNodes
                } satisfies GSMessage)
            );
            const boundScope = wallBindings.get(wallId);
            const bound = boundScope !== undefined;
            const s = bound ? scopedState.get(boundScope) : null;
            peer.send(
                JSON.stringify({
                    type: 'wall_binding_status',
                    wallId,
                    bound,
                    ...(s
                        ? {
                              projectId: s.projectId,
                              commitId: s.commitId,
                              slideId: s.slideId,
                              customRenderUrl: s.customRenderUrl,
                              boundSource: wallBindingSources.get(wallId)
                          }
                        : {})
                } satisfies GSMessage)
            );
        }
    }
}

async function completeHelloRegistration(
    peer: Peer,
    parsed: DeviceHelloMessage,
    passedAuthContext: AuthContext
) {
    if (parsed.specimen === 'wall') {
        const wallDevice = parsed.devicePublicKey
            ? await ensureDeviceByPublicKey({
                  publicKey: parsed.devicePublicKey,
                  kind: 'wall'
              })
            : null;
        if (wallDevice?.status === 'pending') {
            sendJSON(peer, {
                type: 'device_enrollment',
                deviceId: wallDevice.deviceId
            });
            return;
        }
        const effectiveWallId = wallDevice?.assignedWallId ?? parsed.wallId;
        const intendedWallSlug = parsed.wallId;
        const deviceAuthContext = wallDevice
            ? {
                  kind: 'wall' as const,
                  wallId: effectiveWallId,
                  id: wallDevice.deviceId
              }
            : passedAuthContext.device
              ? {
                    kind: 'wall' as const,
                    wallId: effectiveWallId,
                    id: passedAuthContext.device.id
                }
              : undefined;
        const authContext: AuthContext = {
            ...(passedAuthContext.user ? { user: passedAuthContext.user } : {}),
            ...(deviceAuthContext ? { device: deviceAuthContext } : {})
        };

        registerPeer(peer, {
            specimen: 'wall',
            wallId: effectiveWallId,
            intendedWallSlug,
            col: parsed.col,
            row: parsed.row,
            authContext
        });

        const boundScope = wallBindings.get(effectiveWallId);

        peer.send(
            boundScope !== undefined
                ? getWallHydratePayload(boundScope, effectiveWallId)
                : EMPTY_HYDRATE
        );

        broadcastWallNodeCountToEditors(effectiveWallId);
        broadcastWallBindingToEditors(effectiveWallId);
        broadcastWallBindingToGalleries(effectiveWallId);

        console.log(
            `[WS] Wall joined wallId=${effectiveWallId} ` +
                `(bound=${boundScope !== undefined ? scopeLabel(boundScope) : `none`})`
        );
        logPeerCounts();
        return;
    }

    if (parsed.specimen === 'controller') {
        let controllerDevice: Awaited<ReturnType<typeof ensureDeviceByPublicKey>> | null = null;
        if (parsed.devicePublicKey) {
            controllerDevice = await ensureDeviceByPublicKey({
                publicKey: parsed.devicePublicKey,
                kind: 'controller'
            });
            if (controllerDevice.status === 'pending') {
                sendJSON(peer, {
                    type: 'device_enrollment',
                    deviceId: controllerDevice.deviceId
                });
                return;
            }
        }

        const authContext: AuthContext = {
            ...(passedAuthContext.user ? { user: passedAuthContext.user } : {}),
            ...(controllerDevice
                ? {
                      device: {
                          kind: 'controller' as const,
                          wallId: parsed.wallId,
                          id: controllerDevice.deviceId
                      }
                  }
                : passedAuthContext.device
                  ? {
                        device: {
                            kind: 'controller' as const,
                            wallId: parsed.wallId,
                            id: passedAuthContext.device.id
                        }
                    }
                  : {}),
            ...(passedAuthContext.portal ? { portal: passedAuthContext.portal } : {})
        };

        registerPeer(peer, {
            specimen: 'controller',
            wallId: parsed.wallId,
            authContext
        });

        const boundScope = wallBindings.get(parsed.wallId);
        const scope = boundScope !== undefined ? scopedState.get(boundScope) : null;
        sendJSON(peer, {
            type: 'wall_binding_status',
            wallId: parsed.wallId,
            bound: boundScope !== undefined,
            ...(scope
                ? {
                      projectId: scope.projectId,
                      commitId: scope.commitId,
                      slideId: scope.slideId,
                      customRenderUrl: scope.customRenderUrl,
                      boundSource: wallBindingSources.get(parsed.wallId)
                  }
                : {})
        });
        peer.send(
            boundScope !== undefined
                ? getWallHydratePayload(boundScope, parsed.wallId)
                : EMPTY_HYDRATE
        );
        if (scope?.commitId) {
            void sendSlidesSnapshotToControllerPeer(peer, scope.commitId);
        }

        console.log(`[WS] Controller joined wallId=${parsed.wallId}`);
        logPeerCounts();
        return;
    }

    let galleryDevice: Awaited<ReturnType<typeof ensureDeviceByPublicKey>> | null = null;
    if (parsed.devicePublicKey) {
        galleryDevice = await ensureDeviceByPublicKey({
            publicKey: parsed.devicePublicKey,
            kind: 'gallery'
        });
        if (galleryDevice.status === 'pending') {
            sendJSON(peer, {
                type: 'device_enrollment',
                deviceId: galleryDevice.deviceId
            });
            if (!(passedAuthContext.user?.role === 'admin')) return;
        }
    }

    const authContext: AuthContext = {
        ...(passedAuthContext.user ? { user: passedAuthContext.user } : {}),
        ...(galleryDevice
            ? {
                  device: {
                      kind: 'gallery' as const,
                      ...(parsed.wallId ? { wallId: parsed.wallId } : {}),
                      id: galleryDevice.deviceId
                  }
              }
            : passedAuthContext.device
              ? {
                    device: {
                        kind: 'gallery' as const,
                        ...(parsed.wallId ? { wallId: parsed.wallId } : {}),
                        id: passedAuthContext.device.id
                    }
                }
              : {})
    };

    registerPeer(peer, {
        specimen: 'gallery',
        ...(parsed.wallId ? { wallId: parsed.wallId } : {}),
        authContext
    });
    void sendGalleryStateSnapshot(peer, parsed.wallId);
    console.log(`[WS] Gallery joined${parsed.wallId ? ` wallId=${parsed.wallId}` : ` (global)`}`);
    logPeerCounts();
}

function handleEditorScopeVacated(scopeId: number) {
    const remainingEditors = editorsByScope.get(scopeId)?.size ?? 0;
    if (remainingEditors > 0) return;

    for (const [wallId, boundScopeId] of wallBindings) {
        if (boundScopeId !== scopeId) continue;
        if (wallBindingSources.get(wallId) !== 'live') continue;

        unbindWall(wallId);
        hydrateWallNodes(wallId);
        broadcastToControllersByWallRaw(
            wallId,
            JSON.stringify({ type: 'hydrate', layers: [] } satisfies GSMessage)
        );
        notifyControllers(wallId, false);
        void collections.walls.updateOne(
            { wallId },
            {
                $set: {
                    boundProjectId: null,
                    boundCommitId: null,
                    boundSlideId: null,
                    boundSource: null,
                    updatedAt: new Date().toISOString()
                }
            }
        );
        broadcastWallBindingToEditors(wallId);
        broadcastWallBindingToGalleries(wallId);
    }
}

async function recomputePeerAuthContexts(input: { email?: string; projectId?: string } = {}) {
    let inspected = 0;
    let refreshed = 0;
    let disconnected = 0;

    for (const entry of peers.values()) {
        if (entry.meta.specimen !== 'editor') continue;
        const currentEmail = entry.meta.authContext?.user?.email ?? null;
        const currentRole = entry.meta.authContext?.user?.role ?? null;
        const scopeProjectId = entry.meta.scope?.projectId ?? null;
        if (input.email && currentEmail !== input.email) continue;
        if (input.projectId && scopeProjectId !== input.projectId) continue;
        inspected += 1;

        const {
            authContext: { user }
        } = await resolveAuthContextFromRequest(entry.peer.request);
        if (!user) {
            sendJSON(entry.peer, { type: 'auth_denied', reason: 'missing_session' });
            try {
                entry.peer.close();
            } catch {
                // no-op
            }
            disconnected += 1;
            continue;
        }
        if (user.email !== currentEmail || user.role !== currentRole) {
            entry.meta = {
                ...entry.meta,
                authContext: {
                    ...(entry.meta.authContext ?? {}),
                    user
                }
            };
            refreshed += 1;
        }
    }

    return { inspected, refreshed, disconnected };
}

handlers.set('rehydrate_please', ({ entry }) => {
    const { meta } = entry;

    if (meta.specimen === 'editor') {
        if (!meta.scope) {
            entry.peer.send(EMPTY_HYDRATE);
            return;
        }
        entry.peer.send(getEditorHydratePayload(meta.scope.scopeId));
    } else if (meta.specimen === 'wall') {
        const boundScope = wallBindings.get(meta.wallId);
        entry.peer.send(
            boundScope !== undefined
                ? getWallHydratePayload(boundScope, meta.wallId)
                : EMPTY_HYDRATE
        );
    } else if (meta.specimen === 'controller') {
        const boundScope = wallBindings.get(meta.wallId);
        entry.peer.send(
            boundScope !== undefined
                ? getWallHydratePayload(boundScope, meta.wallId)
                : EMPTY_HYDRATE
        );
        if (boundScope !== undefined) {
            const scope = scopedState.get(boundScope);
            if (scope?.commitId) {
                void sendSlidesSnapshotToControllerPeer(entry.peer, scope.commitId);
            }
        }
    }
});

handlers.set('clear_stage', ({ entry, scopeId }) => {
    if (scopeId === null) return;
    const scope = scopedState.get(scopeId);
    if (scope) {
        for (const numericId of scope.layers.keys()) {
            clearPlaybackCommand(scopeId, numericId);
        }
        scope.layers.clear();
        scope.dirty = true;
    }
    clearActiveVideosForScope(scopeId);
    clearControllerTransientForScope(scopeId);
    // clearLayerNodesForScope(scopeId);
    invalidateHydrateCache(scopeId);
    const clearPayload = { type: 'hydrate', layers: [] } satisfies GSMessage;
    broadcastToScope(scopeId, clearPayload, entry);
    broadcastToControllersByScopeRaw(scopeId, JSON.stringify(clearPayload));
});

handlers.set('upsert_layer', ({ entry, data, scopeId, rawText }) => {
    let layer = data.layer;
    if (typeof layer?.numericId !== 'number') return;

    const isControllerTransientUpsert = data.origin === 'controller:add_line_layer';
    let relayPayload = rawText;

    if (scopeId !== null) {
        const scope = scopedState.get(scopeId);
        if (scope) {
            if (isControllerTransientUpsert) {
                // Controller drawings are transient wall overlays: no DB persistence and no editor fanout.
                if (entry.meta.specimen !== 'controller') return;
                upsertControllerTransientLayer(entry.meta.wallId, layer);
            } else {
                // Playback timeline is authoritative via video_play/pause/seek handlers.
                // Generic upsert_layer must never override live playback state.
                if (layer.type === 'video') {
                    const existing = scope.layers.get(layer.numericId);
                    if (existing?.type === 'video' && existing.playback) {
                        layer = { ...layer, playback: existing.playback };
                        relayPayload = JSON.stringify({ ...data, layer });
                    } else if (!layer.playback) {
                        layer = {
                            ...layer,
                            playback: {
                                status: 'paused',
                                anchorMediaTime: 0,
                                anchorServerTime: 0
                            }
                        };
                        relayPayload = JSON.stringify({ ...data, layer });
                    }
                }
                scope.layers.set(layer.numericId, layer);
                scope.dirty = true;
                invalidateHydrateCache(scopeId);
            }
        }
        // recomputeLayerNodes(layer.numericId, layer, scopeId);
        if (isControllerTransientUpsert) {
            if (entry.meta.specimen !== 'controller') return;
            broadcastToWallNodesRaw(entry.meta.wallId, relayPayload);
            broadcastToControllersByWallRaw(entry.meta.wallId, relayPayload, entry);
        } else {
            broadcastToScopeRaw(scopeId, relayPayload, entry);
        }
    }
});

handlers.set('delete_layer', ({ entry, data, scopeId, rawText }) => {
    if (scopeId === null) return;
    const isControllerTransientDelete = data.origin === 'controller:add_line_layer';
    const scope = scopedState.get(scopeId);
    let deletedPersistentLayer = false;
    let deletedControllerTransient = false;

    if (scope) {
        if (isControllerTransientDelete) {
            if (entry.meta.specimen !== 'controller') return;
            deletedControllerTransient = deleteControllerTransientLayer(
                entry.meta.wallId,
                data.numericId
            );
        } else {
            deletedPersistentLayer = scope.layers.delete(data.numericId);
            if (deletedPersistentLayer) {
                clearPlaybackCommand(scopeId, data.numericId);
                scope.dirty = true;
                deleteYDocForLayer(scopeId, data.numericId);
            }
            deletedControllerTransient = deleteControllerTransientLayerForScope(
                scopeId,
                data.numericId
            );
            invalidateHydrateCache(scopeId);
        }
    }

    if (deletedPersistentLayer) {
        unregisterActiveVideo(data.numericId);
    }
    // deleteLayerNodes(data.numericId);
    if (isControllerTransientDelete || (deletedControllerTransient && !deletedPersistentLayer)) {
        if (entry.meta.specimen !== 'controller') return;
        broadcastToWallNodesRaw(entry.meta.wallId, rawText);
        broadcastToControllersByWallRaw(entry.meta.wallId, rawText, entry);
    } else {
        broadcastToScopeRaw(scopeId, rawText, entry);
    }
});

handlers.set('seed_scope', ({ entry, data, scopeId }) => {
    if (scopeId === null) return;
    const scope = scopedState.get(scopeId);
    if (!scope) return;

    // Replace all layers wholesale
    scope.layers.clear();
    for (const layer of data.layers) {
        if (typeof layer?.numericId === 'number') {
            scope.layers.set(layer.numericId, layer);
        }
    }
    scope.dirty = true;

    clearActiveVideosForScope(scopeId);
    clearControllerTransientForScope(scopeId);
    invalidateHydrateCache(scopeId);

    // Cascade hydrate to all bound walls
    for (const [wallId, boundScope] of wallBindings) {
        if (boundScope === scopeId) {
            hydrateWallNodes(wallId);
        }
    }

    // Broadcast hydrate to other editors in scope
    broadcastToEditors(
        scopeId,
        { type: 'hydrate', layers: Array.from(scope.layers.values()) },
        entry
    );
});

handlers.set('update_slides', ({ entry, data }) => {
    const { commitId, slides } = data;
    if (!commitId || !Array.isArray(slides)) return;

    // Persist metadata to DB (no layer changes)
    persistSlideMetadata(commitId, slides).then((ok) => {
        if (!ok) {
            console.error(`[Bus] Failed to persist slide metadata for commit ${commitId}`);
            return;
        }

        // Broadcast slides_updated to all editors + controllers on this commit
        const payload = JSON.stringify({ type: 'slides_updated', commitId, slides });
        broadcastToEditorsByCommit(commitId, payload, entry);
        notifyControllersByCommit(commitId, payload);
    });
});

handlers.set('reboot', ({ scopeId, rawText }) => {
    if (scopeId !== null) {
        broadcastToWallsRaw(scopeId, rawText);
    }
});

handlers.set('stage_dirty', ({ scopeId }) => {
    if (scopeId === null) return;
    const scope = scopedState.get(scopeId);
    if (scope) scope.dirty = true;
});

handlers.set('leave_scope', ({ entry }) => {
    const meta = entry.meta;
    if (meta.specimen !== 'editor' || !meta.scope) return;
    const scopeId = meta.scope.scopeId;
    setEditorScope(entry, null);
    handleEditorScopeVacated(scopeId);
    logPeerCounts();
});

handlers.set('stage_save', ({ entry, data, scopeId }) => {
    if (scopeId === null) {
        sendJSON(entry.peer, {
            type: 'stage_save_response',
            success: false,
            error: 'Not in a scope'
        });
        return;
    }

    const capturedScopeId = scopeId;
    const capturedEntry = entry;

    saveScope(capturedScopeId, data.message, data.isAutoSave ?? false).then((result) => {
        const response: GSMessage = {
            type: 'stage_save_response',
            success: result.success,
            commitId: result.commitId,
            error: result.error
        };
        sendJSON(capturedEntry.peer, response);

        if (result.success) {
            broadcastToEditors(capturedScopeId, response, capturedEntry);
        }
    });
});

handlers.set('bind_wall', ({ entry, data }) => {
    // Editors should route through request_bind_wall (approval gate).
    // Keep bind_wall for controllers and system/internal callers.
    void (async () => {
        const source = entry.meta.specimen === 'gallery' ? 'gallery' : 'live';
        await performLiveBind(data.wallId, data.projectId, data.commitId, data.slideId, source);
    })();
});

handlers.set('request_bind_wall', ({ entry, data }) => {
    if (entry.meta.specimen !== 'editor') {
        sendJSON(entry.peer, {
            type: 'bind_override_result',
            requestId: data.requestId,
            wallId: data.wallId,
            allow: false,
            reason: 'invalid'
        });
        return;
    }
    const userEmail =
        entry.meta.specimen === 'editor' ? entry.meta.authContext?.user?.email : undefined;

    void (async () => {
        const resolvedSlideId = await resolveBoundSlideId(
            data.projectId,
            data.commitId,
            data.slideId
        );
        if (!resolvedSlideId) {
            sendBindOverrideResult(entry.peer.id, {
                type: 'bind_override_result',
                requestId: data.requestId,
                wallId: data.wallId,
                allow: false,
                reason: 'invalid'
            });
            return;
        }

        const targetScopeId = internScope(data.projectId, data.commitId, resolvedSlideId);
        const currentScopeId = wallBindings.get(data.wallId);
        const hasConflict = currentScopeId !== undefined && currentScopeId !== targetScopeId;

        if (!hasConflict) {
            const result = await performLiveBind(
                data.wallId,
                data.projectId,
                data.commitId,
                resolvedSlideId
            );
            sendBindOverrideResult(entry.peer.id, {
                type: 'bind_override_result',
                requestId: data.requestId,
                wallId: data.wallId,
                allow: result.ok,
                reason: result.ok
                    ? 'not_required'
                    : result.error === 'unknown_wall'
                      ? 'unknown_wall'
                      : 'invalid'
            });
            return;
        }

        const galleries = galleriesByWallId.get(data.wallId);
        const hasGalleryApprover = Boolean(galleries && galleries.size > 0);
        if (!hasGalleryApprover) {
            const result = await performLiveBind(
                data.wallId,
                data.projectId,
                data.commitId,
                resolvedSlideId
            );
            sendBindOverrideResult(entry.peer.id, {
                type: 'bind_override_result',
                requestId: data.requestId,
                wallId: data.wallId,
                allow: result.ok,
                reason: result.ok
                    ? 'not_required'
                    : result.error === 'unknown_wall'
                      ? 'unknown_wall'
                      : 'invalid'
            });
            return;
        }

        const existingRequestId = pendingBindOverrideByWall.get(data.wallId);
        if (existingRequestId) {
            clearPendingBindOverride(existingRequestId);
        }

        const expiresAt = Date.now() + BIND_OVERRIDE_TIMEOUT_MS;
        const timer = setTimeout(() => {
            const pending = clearPendingBindOverride(data.requestId);
            if (!pending) return;
            sendBindOverrideResult(pending.requesterPeerId, {
                type: 'bind_override_result',
                requestId: pending.requestId,
                wallId: pending.wallId,
                allow: false,
                reason: 'timeout'
            });
        }, BIND_OVERRIDE_TIMEOUT_MS);

        pendingBindOverrides.set(data.requestId, {
            requestId: data.requestId,
            requesterPeerId: entry.peer.id,
            wallId: data.wallId,
            projectId: data.projectId,
            commitId: data.commitId,
            slideId: resolvedSlideId,
            timer
        });
        pendingBindOverrideByWall.set(data.wallId, data.requestId);

        const requestPayload = JSON.stringify({
            type: 'bind_override_requested',
            requestId: data.requestId,
            wallId: data.wallId,
            projectId: data.projectId,
            commitId: data.commitId,
            slideId: resolvedSlideId,
            expiresAt,
            ...(userEmail ? { requesterEmail: userEmail } : {})
        } satisfies GSMessage);

        for (const galleryEntry of galleries!) {
            galleryEntry.peer.send(requestPayload);
        }
    })();
});

handlers.set('bind_override_decision', ({ entry, data }) => {
    if (entry.meta.specimen !== 'gallery') return;
    if (entry.meta.wallId !== data.wallId) return;

    const pending = clearPendingBindOverride(data.requestId);
    if (!pending) return;
    if (pending.wallId !== data.wallId) return;

    if (!data.allow) {
        sendBindOverrideResult(pending.requesterPeerId, {
            type: 'bind_override_result',
            requestId: pending.requestId,
            wallId: pending.wallId,
            allow: false,
            reason: 'denied'
        });
        return;
    }

    void (async () => {
        const result = await performLiveBind(
            pending.wallId,
            pending.projectId,
            pending.commitId,
            pending.slideId
        );
        sendBindOverrideResult(pending.requesterPeerId, {
            type: 'bind_override_result',
            requestId: pending.requestId,
            wallId: pending.wallId,
            allow: result.ok,
            reason: result.ok
                ? 'approved'
                : result.error === 'unknown_wall'
                  ? 'unknown_wall'
                  : 'invalid'
        });
    })();
});

handlers.set('unbind_wall', ({ data }) => {
    cancelWallUnbindGrace(data.wallId);
    unbindWall(data.wallId);
    hydrateWallNodes(data.wallId);
    broadcastToControllersByWallRaw(
        data.wallId,
        JSON.stringify({ type: 'hydrate', layers: [] } satisfies GSMessage)
    );
    notifyControllers(data.wallId, false);
    void collections.walls.updateOne(
        { wallId: data.wallId },
        {
            $set: {
                boundProjectId: null,
                boundCommitId: null,
                boundSlideId: null,
                boundSource: null,
                updatedAt: new Date().toISOString()
            }
        }
    );
    broadcastWallBindingToEditors(data.wallId);
    broadcastWallBindingToGalleries(data.wallId);
    broadcastWallNodeCountToEditors(data.wallId);
    console.log(`[WS] Wall ${data.wallId} unbound`);
});

handlers.set('video_play', ({ data, scopeId }) => {
    if (scopeId === null) return;
    if (!shouldApplyPlaybackCommand(scopeId, data.numericId, data.issuedAt)) return;
    const layer = scopedState.get(scopeId)?.layers.get(data.numericId);
    if (layer?.type === 'video') {
        const leadMs = estimatePlaybackLeadMs(scopeId);
        layer.playback.status = 'playing';
        layer.playback.anchorServerTime = Date.now() + leadMs;
        registerActiveVideo(data.numericId, scopeId, layer);
        sendVideoSyncToRelevantWalls(data.numericId, scopeId, layer.playback, {
            criticalToWalls: true
        });
    }
});

handlers.set('video_pause', ({ data, scopeId }) => {
    if (scopeId === null) return;
    if (!shouldApplyPlaybackCommand(scopeId, data.numericId, data.issuedAt)) return;
    const layer = scopedState.get(scopeId)?.layers.get(data.numericId);
    if (layer?.type === 'video' && layer.playback.status === 'playing') {
        let elapsed = (Date.now() - layer.playback.anchorServerTime) / 1000;
        if (elapsed < 0) elapsed = 0;

        layer.playback.status = 'paused';
        layer.playback.anchorMediaTime += elapsed;
        layer.playback.anchorServerTime = 0;

        unregisterActiveVideo(data.numericId);
        sendVideoSyncToRelevantWalls(data.numericId, scopeId, layer.playback, {
            criticalToWalls: true
        });
    }
});

handlers.set('video_seek', ({ data, scopeId }) => {
    if (scopeId === null) return;
    if (!shouldApplyPlaybackCommand(scopeId, data.numericId, data.issuedAt)) return;
    const layer = scopedState.get(scopeId)?.layers.get(data.numericId);
    if (layer?.type === 'video') {
        layer.playback.status = 'paused';
        layer.playback.anchorMediaTime = data.mediaTime;
        layer.playback.anchorServerTime = 0;

        unregisterActiveVideo(data.numericId);
        sendVideoSyncToRelevantWalls(data.numericId, scopeId, layer.playback, {
            criticalToWalls: true
        });
    }
});

async function handleHello(peer: Peer, data: Record<string, any>) {
    // Full Zod validation on handshake
    const parsed = HelloSchema.parse(data);

    // Re-registration: clean up old state first
    const existing = peers.get(peer.id);
    if (existing) unregisterPeer(peer.id);
    clearPendingHelloAuth(peer.id);

    if (parsed.specimen === 'editor') {
        const {
            authContext: { user }
        } = await resolveAuthContextFromRequest(peer.request);
        if (!user) {
            sendJSON(peer, { type: 'auth_denied', reason: 'missing_session' });
            try {
                peer.close();
            } catch {
                // no-op
            }
            return;
        }
        registerPeer(peer, {
            specimen: 'editor',
            authContext: {
                user
            }
        });
        sendJSON(peer, { type: 'hello_authenticated' });
        console.log('[WS] Editor registered (no scope)');
        logPeerCounts();
        return;
    }

    issueHelloChallenge(peer, parsed);
}

async function handleHelloAuth(peer: Peer, data: Record<string, any>) {
    const parsed = GSMessageSchema.parse(data);
    if (parsed.type !== 'hello_auth') return;

    const pending = pendingHelloAuthByPeer.get(peer.id);
    if (!pending) {
        console.warn(`[WS] hello_auth without pending challenge from peer ${peer.id}`);
        return;
    }

    let authenticated = false;
    const resolvedAuth: AuthContext = {};

    if (parsed.proof.signature && pending.hello.devicePublicKey) {
        const valid = await verifyDeviceSignature(
            pending.hello.devicePublicKey,
            pending.nonce,
            parsed.proof.signature
        );
        if (valid) {
            const kind: 'wall' | 'controller' | 'gallery' =
                pending.hello.specimen === 'wall'
                    ? 'wall'
                    : pending.hello.specimen === 'controller'
                      ? 'controller'
                      : 'gallery';
            const ensuredDevice = await ensureDeviceByPublicKey({
                publicKey: pending.hello.devicePublicKey,
                kind
            });
            authenticated = true;
            if (pending.hello.specimen === 'wall') {
                resolvedAuth.device = {
                    id: ensuredDevice.deviceId,
                    kind: 'wall',
                    wallId: pending.hello.wallId
                };
            } else if (pending.hello.specimen === 'controller') {
                resolvedAuth.device = {
                    id: ensuredDevice.deviceId,
                    kind: 'controller',
                    wallId: pending.hello.wallId
                };
            } else {
                resolvedAuth.device = {
                    id: ensuredDevice.deviceId,
                    kind: 'gallery',
                    ...(pending.hello.wallId ? { wallId: pending.hello.wallId } : {})
                };
            }
        } else {
            console.warn(`[WS] Invalid hello signature from peer ${peer.id}`);
        }
    }

    if (!authenticated && parsed.proof.portalToken) {
        if (pending.hello.specimen === 'controller') {
            const validated = validatePortalToken(parsed.proof.portalToken);
            if (validated && validated.wallId === pending.hello.wallId) {
                authenticated = true;
                resolvedAuth.portal = { wallId: validated.wallId };
            } else {
                console.warn(`[WS] Invalid controller portal token on peer ${peer.id}`);
            }
        } else {
            console.warn(
                `[WS] portalToken proof is only supported for controller peers (${peer.id})`
            );
        }
    }

    if (!authenticated) {
        clearPendingHelloAuth(peer.id);
        console.warn(`[WS] hello_auth failed for peer ${peer.id}`);
        return;
    }

    const {
        authContext: { user }
    } = await resolveAuthContextFromRequest(peer.request);
    if (user) {
        resolvedAuth.user = user;
    }

    clearPendingHelloAuth(peer.id);
    sendJSON(peer, { type: 'hello_authenticated' });
    await completeHelloRegistration(peer, pending.hello, resolvedAuth);
}

async function handleSwitchScope(peer: Peer, data: Record<string, any>) {
    const parsed = GSMessageSchema.parse(data);
    if (parsed.type !== 'switch_scope') return;

    if (!(await enforceWsRateLimit(peer, parsed.type, { projectId: parsed.projectId }))) {
        return;
    }

    const existing = peers.get(peer.id);
    if (existing && existing.meta.specimen !== 'editor') {
        console.warn(`[WS] switch_scope rejected for non-editor peer ${peer.id}`);
        return;
    }

    if (!existing || existing.meta.specimen !== 'editor') {
        console.warn(`[WS] switch_scope from unauthenticated peer ${peer.id}`);
        return;
    }

    await registerEditorPeer(peer, {
        projectId: parsed.projectId,
        commitId: parsed.commitId,
        slideId: parsed.slideId
    });

    console.log(
        `[WS] Editor switched scope=${makeScopeLabel(parsed.projectId, parsed.commitId, parsed.slideId)}`
    );
    logPeerCounts();
}

// ── Binary message handler ──────────────────────────────────────────────────

function handleBinary(peer: Peer, rawData: ArrayBuffer) {
    markIncomingBinary();
    const view = new DataView(rawData);
    const opcode = view.getUint8(0);

    // Clock Ping > Pong (pre-allocated buffer, zero alloc)
    if (opcode === OP.CLOCK_PING) {
        touchPing(peer.id);
        const t0 = view.getFloat64(1, true);
        const t1 = Date.now();
        const t2 = Date.now();

        pongView.setFloat64(1, t0, true);
        pongView.setFloat64(9, t1, true);
        pongView.setFloat64(17, t2, true);
        peer.send(pongBuf);
        return;
    }

    // Spatial Move — scoped relay with AABB filtering for walls
    if (opcode === OP.SPATIAL_MOVE) {
        const senderEntry = peers.get(peer.id);
        if (!senderEntry) return;

        const senderScopeId = resolveScopeId(senderEntry.meta);
        if (senderScopeId === null) return;

        // Relay to editors (direct PeerEntry iteration, no map lookups per recipient)
        const editorEntries = editorsByScope.get(senderScopeId);
        if (editorEntries) {
            for (const entry of editorEntries) {
                if (entry !== senderEntry) entry.peer.send(rawData);
            }
        }

        // Relay to walls: currently broadcasts to all walls in scope.
        // AABB spatial filtering is disabled because the layerNodes pre-computation
        // created consistency issues during rapid layer mutations — walls could miss moves for
        // layers that weren't yet registered in their node set. Re-enable for large deployments
        // (100+ walls) once layerNodes tracking is stabilised and tested under concurrent edits.
        //
        // const layerId = view.getUint16(3, true);
        // const targets = layerNodes.get(layerId);
        // if (targets) {
        //     for (const entry of targets) {
        //         if (canSendNonCritical(entry.peer)) entry.peer.send(rawData);
        //     }
        // } else {
        broadcastToWallsBinary(senderScopeId, rawData);
        // }
    }
}

// ── WebSocket Handler ───────────────────────────────────────────────────────

const hooks = defineHooks({
    open(peer) {
        peer.websocket.binaryType = 'arraybuffer';
        console.log(`[WS] Peer ${peer.id} connected`);
    },

    close(peer) {
        wsRateLimitStrikes.delete(peer.id);
        clearPendingHelloAuth(peer.id);
        // Cancel pending override requests from disconnected requester.
        for (const [requestId, pending] of pendingBindOverrides) {
            if (pending.requesterPeerId !== peer.id) continue;
            clearPendingBindOverride(requestId);
        }

        const meta = unregisterPeer(peer.id);
        const disconnectedDeviceId = meta?.authContext?.device?.id;
        if (typeof disconnectedDeviceId === 'string') {
            void markDeviceDisconnectedById(disconnectedDeviceId);
        }
        if (meta?.specimen === 'editor' && meta.scope?.scopeId !== undefined) {
            handleEditorScopeVacated(meta.scope.scopeId);
        }
        if (meta?.specimen === 'wall') {
            if (getWallNodeCount(meta.wallId) <= 0) {
                scheduleWallUnbindGrace(meta.wallId, () => {
                    // Wall may have reconnected during grace period.
                    if (getWallNodeCount(meta.wallId) > 0) return;

                    unbindWall(meta.wallId);
                    hydrateWallNodes(meta.wallId);
                    broadcastToControllersByWallRaw(
                        meta.wallId,
                        JSON.stringify({ type: 'hydrate', layers: [] } satisfies GSMessage)
                    );
                    notifyControllers(meta.wallId, false);
                    void collections.walls.updateOne(
                        { wallId: meta.wallId },
                        {
                            $set: {
                                boundProjectId: null,
                                boundCommitId: null,
                                boundSlideId: null,
                                boundSource: null,
                                updatedAt: new Date().toISOString()
                            }
                        }
                    );
                    broadcastWallBindingToEditors(meta.wallId);
                    broadcastWallBindingToGalleries(meta.wallId);
                    broadcastWallNodeCountToEditors(meta.wallId);
                });
            }
            broadcastWallNodeCountToEditors(meta.wallId);
            broadcastWallBindingToEditors(meta.wallId);
            broadcastWallBindingToGalleries(meta.wallId);
        }
        logPeerCounts();
    },

    message(peer, message) {
        const raw = message.rawData;
        const knownPeer = peers.get(peer.id);
        if (knownPeer) {
            const specimen = knownPeer.meta.specimen;
            if (specimen === 'editor' || specimen === 'wall') {
                touchPing(peer.id);
            }
        }

        // ── Binary fast-path (ArrayBuffer) ───────────────────────────
        if (raw instanceof ArrayBuffer) {
            handleBinary(peer, raw);
            return;
        }

        // ── Mixed Buffer/Uint8Array path (text or binary) ────────────
        if (raw instanceof Buffer || raw instanceof Uint8Array) {
            const first = firstNonWhitespaceByte(raw);
            const looksLikeJson = first === 0x7b || first === 0x5b; // '{' or '['

            if (!looksLikeJson) {
                handleBinary(peer, toArrayBufferView(raw));
                return;
            }

            const rawText = message.text();

            try {
                const data = JSON.parse(rawText);
                markIncomingJson();

                if (!hasType(data)) {
                    console.warn(`[WS] Invalid message from peer ${peer.id}: missing type`);
                    return;
                }

                // Hello: full Zod validation (cold path, once per connection)
                if (data.type === 'hello') {
                    void handleHello(peer, data).catch((err) => {
                        console.error(`[WS] Hello handler failed for peer ${peer.id}:`, err);
                    });
                    return;
                }
                if (data.type === 'hello_auth') {
                    void handleHelloAuth(peer, data).catch((err) => {
                        console.error(`[WS] Hello auth handler failed for peer ${peer.id}:`, err);
                    });
                    return;
                }
                if (data.type === 'switch_scope') {
                    void handleSwitchScope(peer, data).catch((err) => {
                        console.error(`[WS] switch_scope handler failed for peer ${peer.id}:`, err);
                    });
                    return;
                }

                // All other messages: require registered peer
                const entry = peers.get(peer.id);
                if (!entry) {
                    console.warn(`[WS] Message from unregistered peer ${peer.id}, ignoring`);
                    return;
                }

                const handler = handlers.get(data.type);
                if (handler) {
                    void enforceWsRateLimit(peer, data.type, { entry }).then((allowed) => {
                        if (!allowed) return;
                        try {
                            handler({
                                entry,
                                data,
                                scopeId: resolveScopeId(entry.meta),
                                rawText
                            });
                        } catch (handlerError) {
                            console.error(
                                '[WS] Handler error after rate-limit check:',
                                handlerError
                            );
                        }
                    });
                }
            } catch (err) {
                // Fallback: run full Zod for diagnostic clarity
                try {
                    const reparsed = JSON.parse(rawText);
                    const result = GSMessageSchema.safeParse(reparsed);
                    if (!result.success) {
                        console.warn(
                            `[WS] Peer ${peer.id} sent invalid message:`,
                            result.error.issues
                        );
                    } else {
                        console.error(`[WS] Handler error for valid message:`, err);
                    }
                } catch {
                    console.error(`[WS] Unparseable message from peer ${peer.id}:`, err);
                }
            }
            return;
        }

        // ── JSON path (string payloads) ──────────────────────────────
        if (typeof raw === 'string') {
            try {
                const data = JSON.parse(raw);
                markIncomingJson();

                if (!hasType(data)) {
                    console.warn(`[WS] Invalid message from peer ${peer.id}: missing type`);
                    return;
                }

                if (data.type === 'hello') {
                    void handleHello(peer, data).catch((err) => {
                        console.error(`[WS] Hello handler failed for peer ${peer.id}:`, err);
                    });
                    return;
                }
                if (data.type === 'hello_auth') {
                    void handleHelloAuth(peer, data).catch((err) => {
                        console.error(`[WS] Hello auth handler failed for peer ${peer.id}:`, err);
                    });
                    return;
                }
                if (data.type === 'switch_scope') {
                    void handleSwitchScope(peer, data).catch((err) => {
                        console.error(`[WS] switch_scope handler failed for peer ${peer.id}:`, err);
                    });
                    return;
                }

                const entry = peers.get(peer.id);
                if (!entry) {
                    console.warn(`[WS] Message from unregistered peer ${peer.id}, ignoring`);
                    return;
                }

                const handler = handlers.get(data.type);
                if (handler) {
                    void enforceWsRateLimit(peer, data.type, { entry }).then((allowed) => {
                        if (!allowed) return;
                        try {
                            handler({
                                entry,
                                data,
                                scopeId: resolveScopeId(entry.meta),
                                rawText: raw
                            });
                        } catch (handlerError) {
                            console.error(
                                '[WS] Handler error after rate-limit check:',
                                handlerError
                            );
                        }
                    });
                }
            } catch (err) {
                console.error(`[WS] Unparseable string message from peer ${peer.id}:`, err);
            }
        }
    }
});

export const Route = createFileRoute('/bus')({
    server: {
        handlers: {
            GET: async () => {
                // HTTP fallback response: this endpoint is a websocket upgrade target.
                return Object.assign(
                    new Response('WebSocket upgrade is required.', {
                        status: 426
                    }),
                    {
                        crossws: hooks
                    }
                );
            }
        }
    }
});

// ── Global bridge for upload progress ────────────────────────────────────────
// Uses the flat allEditors set — no scan of full peers map needed.

(process as any).__BROADCAST_EDITORS__ = (data: unknown) => {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    for (const entry of allEditors) {
        entry.peer.send(payload);
    }
};

// Bridge for asset uploads — broadcast asset_added to editors on the same project
(process as any).__BROADCAST_ASSET_ADDED__ = (
    projectId: string,
    asset: Record<string, unknown>
) => {
    broadcastAssetToEditorsByProject(projectId, asset);
};

// Bridge for non-WS wall binding mutations (gallery/admin server functions)
(process as any).__BROADCAST_WALL_BINDING_CHANGED__ = (wallId: string) => {
    broadcastWallBindingToEditors(wallId);
    broadcastWallBindingToGalleries(wallId);
};

// Bridge for publish/unpublish mutations performed via server functions
(process as any).__BROADCAST_PROJECT_PUBLISH_CHANGED__ = (
    projectId: string,
    publishedCommitId: string | null
) => {
    broadcastProjectPublishChanged(projectId, publishedCommitId);
};

// Bridge for admin device revocation: guarantee immediate socket disconnection
// for all peers authenticated as the deleted device id.
(process as any).__DISCONNECT_DEVICE__ = (deviceId: string) => {
    const normalized = deviceId.trim();
    if (!normalized) return 0;
    let closed = 0;
    for (const entry of peers.values()) {
        const peerDeviceId = entry.meta.authContext?.device?.id;
        if (peerDeviceId !== normalized) continue;
        try {
            entry.peer.close();
            closed += 1;
        } catch {
            // no-op
        }
    }
    return closed;
};

(process as any).__BUS_RECOMPUTE_AUTH_CONTEXT__ = async (input?: {
    email?: string;
    projectId?: string;
}) => {
    return recomputePeerAuthContexts(input ?? {});
};

(process as any).__REBOOT_WALL__ = (wallId: string, node?: { c: number; r: number }) => {
    const peersForWall = wallsByWallId.get(wallId);
    if (!peersForWall || peersForWall.size === 0) return 0;
    const payload = JSON.stringify({ type: 'reboot' } satisfies GSMessage);
    let sent = 0;
    for (const entry of peersForWall) {
        if (entry.meta.specimen !== 'wall') continue;
        if (node && (entry.meta.col !== node.c || entry.meta.row !== node.r)) continue;
        entry.peer.send(payload);
        sent += 1;
    }
    return sent;
};

(process as any).__REBOOT_DEVICE__ = (deviceId: string) => {
    const normalized = deviceId.trim();
    if (!normalized) return 0;
    const payload = JSON.stringify({ type: 'reboot' } satisfies GSMessage);
    let sent = 0;
    for (const entry of peers.values()) {
        const peerDeviceId = entry.meta.authContext?.device?.id;
        if (peerDeviceId !== normalized) continue;
        entry.peer.send(payload);
        sent += 1;
    }
    return sent;
};

// Bridge for YJS text updates — scope-targeted upsert into bus state + fanout.
(process as any).__YJS_UPSERT_LAYER__ = (payload: {
    projectId: string;
    commitId: string;
    slideId: string;
    layerId: number;
    textHtml: string;
    fallbackLayer?: Extract<Layer, { type: 'text' }>;
}) => {
    try {
        const { projectId, commitId, slideId, layerId, textHtml, fallbackLayer } = payload;
        const scopeId = internScope(projectId, commitId, slideId);
        const scope = getOrCreateScope(scopeId, projectId, commitId, slideId);

        const existing = scope.layers.get(layerId);
        const nextLayer =
            existing?.type === 'text'
                ? { ...existing, textHtml }
                : fallbackLayer
                  ? { ...fallbackLayer, textHtml }
                  : null;

        if (!nextLayer || nextLayer.type !== 'text') {
            console.warn(
                `[WS] YJS upsert ignored: text layer ${layerId} not found for scope ${makeScopeLabel(projectId, commitId, slideId)}`
            );
            return false;
        }

        scope.layers.set(layerId, nextLayer);
        scope.dirty = true;
        invalidateHydrateCache(scopeId);
        broadcastToScope(scopeId, {
            type: 'upsert_layer',
            origin: 'yjs:sync',
            layer: nextLayer
        });
        return true;
    } catch (error) {
        console.error('[WS] YJS upsert bridge failed:', error);
        return false;
    }
};

// ── VSYNC loop (iterates active videos only) ─────────────────────────────────
// O(playing videos) instead of O(scopes × layers).

if ((process as any).__VSYNC_INTERVAL__) clearInterval((process as any).__VSYNC_INTERVAL__);
(process as any).__VSYNC_INTERVAL__ = setInterval(() => {
    const now = Date.now();
    const batch: Array<{
        numericId: number;
        scopeId: number;
        playback: {
            status: 'playing' | 'paused';
            anchorMediaTime: number;
            anchorServerTime: number;
        };
    }> = [];

    for (const [numericId, { scopeId, layer }] of activeVideos) {
        if (layer.type !== 'video' || !layer.playback || layer.playback.status !== 'playing') {
            activeVideos.delete(numericId);
            continue;
        }

        const duration = layer.duration;
        if (duration <= 0) continue;

        const elapsed = Math.max(0, (now - layer.playback.anchorServerTime) / 1000);
        const expected = layer.playback.anchorMediaTime + elapsed;

        if (expected >= duration) {
            if (layer.loop ?? true) {
                layer.playback.anchorMediaTime = !duration ? 0 : expected % duration;
                layer.playback.anchorServerTime = now;
            } else {
                layer.playback.status = 'paused';
                layer.playback.anchorMediaTime = duration;
                layer.playback.anchorServerTime = 0;
                activeVideos.delete(numericId);
            }

            batch.push({ numericId, scopeId, playback: { ...layer.playback } });
        }
    }

    if (batch.length > 0) broadcastVideoSyncBatchToWalls(batch);
}, 500);

const AUTO_SAVE_INTERVAL = 30_000;

if ((process as any).__AUTO_SAVE_INTERVAL__) clearInterval((process as any).__AUTO_SAVE_INTERVAL__);
(process as any).__AUTO_SAVE_INTERVAL__ = setInterval(() => {
    for (const [scopeId, scope] of scopedState) {
        if (scope.dirty) {
            console.log(`[Bus] Auto-saving scope ${scopeLabel(scopeId)}`);
            saveScope(scopeId, 'Auto-save', true).then((result) => {
                if (result.success) {
                    broadcastToEditors(scopeId, {
                        type: 'stage_save_response',
                        success: true,
                        commitId: result.commitId
                    });
                } else {
                    console.error(
                        `[Bus] Auto-save failed for scope ${scopeLabel(scopeId)}:`,
                        result.error
                    );
                }
            });
        }
    }
}, AUTO_SAVE_INTERVAL);

if ((process as any).__REAPER_INTERVAL__) clearInterval((process as any).__REAPER_INTERVAL__);
(process as any).__REAPER_INTERVAL__ = setInterval(() => {
    reapStalePeers();
}, 10_000);

if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        if ((process as any).__VSYNC_INTERVAL__) clearInterval((process as any).__VSYNC_INTERVAL__);
        if ((process as any).__AUTO_SAVE_INTERVAL__)
            clearInterval((process as any).__AUTO_SAVE_INTERVAL__);
        if ((process as any).__REAPER_INTERVAL__)
            clearInterval((process as any).__REAPER_INTERVAL__);
    });
}
