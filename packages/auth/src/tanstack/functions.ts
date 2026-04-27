import { createServerFn, createServerOnlyFn } from '@tanstack/react-start';
import { getRequest, setResponseHeader } from '@tanstack/react-start/server';

import { auth } from '../auth';

function serializeForClient<T>(value: T): T {
    if (value instanceof Date) {
        return value.toISOString() as T;
    }
    if (
        value &&
        typeof value === 'object' &&
        '_bsontype' in (value as Record<string, unknown>) &&
        (value as Record<string, unknown>)._bsontype === 'ObjectId' &&
        typeof (value as { toHexString?: unknown }).toHexString === 'function'
    ) {
        return (value as unknown as { toHexString: () => string }).toHexString() as T;
    }
    if (Array.isArray(value)) {
        return value.map((item) => serializeForClient(item)) as T;
    }
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = serializeForClient(v);
        }
        return out as T;
    }
    return value;
}

export const $getUser = createServerFn({ method: 'GET' }).handler(async () => {
    const user = await _getUser();
    return serializeForClient(user);
});

export const $getAuthSession = createServerFn({ method: 'GET' }).handler(async () => {
    const session = await _getAuthSession();
    return serializeForClient(session);
});

interface GetUserServerQuery {
    disableCookieCache?: boolean | undefined;
    disableRefresh?: boolean | undefined;
}

/**
 * Server-only util, meant to be used by the $getUser server function and auth middleware so logic can be shared with optional query params.
 *
 * For server app logic, use $getUser or the auth middleware instead.
 */
export const _getUser = createServerOnlyFn(async (query?: GetUserServerQuery) => {
    const session = await _getAuthSession(query);
    return session?.user || null;
});

/**
 * Server-only util for getting the full auth session payload (session + user).
 * For server app logic, use $getAuthSession or auth middleware.
 */
export const _getAuthSession = createServerOnlyFn(async (query?: GetUserServerQuery) => {
    const session = await auth.api.getSession({
        headers: getRequest().headers,
        query,
        returnHeaders: true
    });

    // Forward any Set-Cookie headers to the client, e.g. for session/cache refresh
    const cookies = session.headers?.getSetCookie();
    if (cookies?.length) {
        setResponseHeader('Set-Cookie', cookies);
    }

    return session.response || null;
});
