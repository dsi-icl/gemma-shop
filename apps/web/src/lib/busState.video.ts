import { broadcastToEditorsRaw } from './busState.broadcast';
import {
    activeVideos,
    canSendNonCritical,
    markOutgoing,
    markVideoSyncTelemetry,
    wallPeersByScope,
    type PeerEntry,
    type ScopeId
} from './busState.state';

// Send video_sync to editors (JSON) + intersecting walls (binary, single entry)
export function sendVideoSyncToRelevantWalls(
    numericId: number,
    scopeId: ScopeId,
    playback: { status: 'playing' | 'paused'; anchorMediaTime: number; anchorServerTime: number },
    opts?: { criticalToWalls?: boolean }
) {
    // Editors: JSON (few clients, need it for UI)
    broadcastToEditorsRaw(scopeId, JSON.stringify({ type: 'video_sync', numericId, playback }));

    // Walls: binary (count=1)
    const frame = encodeVideoSyncBinary([
        {
            numericId,
            status: playback.status,
            anchorMediaTime: playback.anchorMediaTime,
            anchorServerTime: playback.anchorServerTime
        }
    ]);

    const targets = wallPeersByScope.get(scopeId);
    if (targets) {
        const criticalToWalls = opts?.criticalToWalls ?? false;
        let sent = 0;
        for (const entry of targets) {
            if (criticalToWalls || canSendNonCritical(entry.peer)) {
                entry.peer.send(frame);
                sent += 1;
            }
        }
        markOutgoing(0, sent);
    }
}

// VSYNC batch: for each wall peer, collect all intersecting active videos,
// encode into a single binary VIDEO_SYNC frame, and send
export function broadcastVideoSyncBatchToWalls(
    videos: Array<{
        numericId: number;
        scopeId: ScopeId;
        playback: {
            status: 'playing' | 'paused';
            anchorMediaTime: number;
            anchorServerTime: number;
        };
    }>
) {
    // Send JSON to editors
    for (const v of videos) {
        broadcastToEditorsRaw(
            v.scopeId,
            JSON.stringify({ type: 'video_sync', numericId: v.numericId, playback: v.playback })
        );
    }

    // Per-peer entry lists
    const peerBatches = new Map<
        PeerEntry,
        Array<{
            numericId: number;
            status: 'playing' | 'paused';
            anchorMediaTime: number;
            anchorServerTime: number;
        }>
    >();

    for (const v of videos) {
        const entry = {
            numericId: v.numericId,
            status: v.playback.status,
            anchorMediaTime: v.playback.anchorMediaTime,
            anchorServerTime: v.playback.anchorServerTime
        };

        const targets = wallPeersByScope.get(v.scopeId);
        if (!targets) continue;

        for (const pe of targets) {
            if (!canSendNonCritical(pe.peer)) continue;
            let list = peerBatches.get(pe);
            if (!list) {
                list = [];
                peerBatches.set(pe, list);
            }
            list.push(entry);
        }
    }

    // Encode and send one binary frame per peer
    for (const [pe, entries] of peerBatches) {
        pe.peer.send(encodeVideoSyncBinary(entries));
        markVideoSyncTelemetry(1, entries.length);
    }
    markOutgoing(0, peerBatches.size);
}

// Encode video sync entries into binary VIDEO_SYNC frame.
// Format: opcode(u8) + count(u16) + [numericId(u16) + status(u8) + anchorMediaTime(f64) + anchorServerTime(f64)]...
export function encodeVideoSyncBinary(
    entries: Array<{
        numericId: number;
        status: 'playing' | 'paused';
        anchorMediaTime: number;
        anchorServerTime: number;
    }>
): ArrayBuffer {
    const buf = new ArrayBuffer(3 + entries.length * 19);
    const view = new DataView(buf);
    view.setUint8(0, 0x15); // VIDEO_SYNC opcode
    view.setUint16(1, entries.length, true);
    let offset = 3;
    for (const e of entries) {
        view.setUint16(offset, e.numericId, true);
        view.setUint8(offset + 2, e.status === 'playing' ? 1 : 0);
        view.setFloat64(offset + 3, e.anchorMediaTime, true);
        view.setFloat64(offset + 11, e.anchorServerTime, true);
        offset += 19;
    }
    return buf;
}

// Re-export activeVideos for the VSYNC loop in bus.ts
export { activeVideos };
