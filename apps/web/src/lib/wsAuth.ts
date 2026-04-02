import { resolveAuthContextFromHeaders } from '@repo/auth/auth-context';
import type { Peer } from 'crossws';

export async function resolvePeerUserEmail(
    peer: Peer,
    opts?: { cacheKey?: string; forceRefresh?: boolean; cacheInPeer?: boolean }
): Promise<string | null> {
    const cacheKey = opts?.cacheKey ?? '__wsUserEmail';
    const forceRefresh = opts?.forceRefresh ?? false;
    const cacheInPeer = opts?.cacheInPeer ?? true;

    if (!forceRefresh && cacheInPeer) {
        const cached = (peer as any)[cacheKey];
        if (typeof cached === 'string' && cached.length > 0) return cached;
    }

    try {
        const headers = peer.request?.headers as Headers | undefined;
        if (!headers) return null;

        const { authContext } = await resolveAuthContextFromHeaders(headers);
        const email = authContext.user?.email;
        if (typeof email !== 'string' || email.length === 0) return null;
        if (cacheInPeer) {
            (peer as any)[cacheKey] = email;
        }
        return email;
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn(`[WS Auth] Failed to resolve user email for peer ${peer.id}`, error);
        }
        return null;
    }
}
