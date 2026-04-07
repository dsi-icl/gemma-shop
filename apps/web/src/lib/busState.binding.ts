import { cancelScopeCleanup, scheduleScopeCleanup } from './busState.persistence';
import {
    clearControllerTransientForWall,
    scopeWatchers,
    wallBindings,
    wallBindingSources,
    wallPeersByScope,
    wallsByWallId,
    wallUnbindTimers,
    type ScopeId
} from './busState.state';
import { revokePortalTokensForWall } from './portalTokens';

const WALL_UNBIND_GRACE_MS = 5_000; // 5 seconds

export function bindWall(wallId: string, scopeId: ScopeId, source: 'live' | 'gallery' = 'gallery') {
    const oldScopeId = wallBindings.get(wallId);
    // Never let old controller API credentials survive a wall rebind.
    revokePortalTokensForWall(wallId);
    clearControllerTransientForWall(wallId);

    // Tear down old binding
    if (oldScopeId !== undefined) {
        const watchers = scopeWatchers.get(oldScopeId);
        if (watchers) {
            watchers.delete(wallId);
            if (watchers.size === 0) scopeWatchers.delete(oldScopeId);
        }
        const wallPeers = wallsByWallId.get(wallId);
        if (wallPeers) {
            const oldSet = wallPeersByScope.get(oldScopeId);
            if (oldSet) {
                for (const entry of wallPeers) oldSet.delete(entry);
                if (oldSet.size === 0) wallPeersByScope.delete(oldScopeId);
            }
        }
        scheduleScopeCleanup(oldScopeId);
    }

    wallBindings.set(wallId, scopeId);
    wallBindingSources.set(wallId, source);
    cancelScopeCleanup(scopeId);

    // Wire up new binding
    let watchers = scopeWatchers.get(scopeId);
    if (!watchers) {
        watchers = new Set();
        scopeWatchers.set(scopeId, watchers);
    }
    watchers.add(wallId);

    const wallPeers = wallsByWallId.get(wallId);
    if (wallPeers) {
        let set = wallPeersByScope.get(scopeId);
        if (!set) {
            set = new Set();
            wallPeersByScope.set(scopeId, set);
        }
        for (const entry of wallPeers) set.add(entry);
    }
}

export function unbindWall(wallId: string) {
    const oldScopeId = wallBindings.get(wallId);
    // Wall credentials become invalid immediately when unbound.
    revokePortalTokensForWall(wallId);
    clearControllerTransientForWall(wallId);
    if (oldScopeId !== undefined) {
        const watchers = scopeWatchers.get(oldScopeId);
        if (watchers) {
            watchers.delete(wallId);
            if (watchers.size === 0) scopeWatchers.delete(oldScopeId);
        }
        const wallPeers = wallsByWallId.get(wallId);
        if (wallPeers) {
            const set = wallPeersByScope.get(oldScopeId);
            if (set) {
                for (const entry of wallPeers) set.delete(entry);
                if (set.size === 0) wallPeersByScope.delete(oldScopeId);
            }
        }
        scheduleScopeCleanup(oldScopeId);
    }
    wallBindings.delete(wallId);
    wallBindingSources.delete(wallId);
}

export function scheduleWallUnbindGrace(wallId: string, onExpire: () => void) {
    if (wallUnbindTimers.has(wallId)) return;
    const timer = setTimeout(() => {
        wallUnbindTimers.delete(wallId);
        onExpire();
    }, WALL_UNBIND_GRACE_MS);
    wallUnbindTimers.set(wallId, timer);
}

export function cancelWallUnbindGrace(wallId: string) {
    const timer = wallUnbindTimers.get(wallId);
    if (!timer) return;
    clearTimeout(timer);
    wallUnbindTimers.delete(wallId);
}
