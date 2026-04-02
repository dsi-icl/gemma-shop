import { auth } from './auth';

type SessionQuery = {
    disableCookieCache?: boolean | undefined;
    disableRefresh?: boolean | undefined;
};

type SessionUser = Record<string, any>;

export type RequestAuthContext = {
    user?: {
        email?: string;
    };
};

export type ResolvedAuthContext = {
    authContext: RequestAuthContext;
    user: SessionUser | null;
    setCookieHeaders: string[];
};

function extractSessionUser(session: unknown): SessionUser | null {
    const responseUser = (session as { response?: { user?: unknown } } | null)?.response?.user;
    if (responseUser && typeof responseUser === 'object') {
        return responseUser as SessionUser;
    }
    const directUser = (session as { user?: unknown } | null)?.user;
    if (directUser && typeof directUser === 'object') {
        return directUser as SessionUser;
    }
    return null;
}

export function buildAuthContextFromUser(user: SessionUser | null): RequestAuthContext {
    const email = typeof user?.email === 'string' && user.email.length > 0 ? user.email : undefined;
    return email ? { user: { email } } : {};
}

export async function resolveAuthContextFromHeaders(
    headers: Headers,
    opts?: { query?: SessionQuery; returnHeaders?: boolean }
): Promise<ResolvedAuthContext> {
    const returnHeaders = opts?.returnHeaders ?? false;
    const session = await auth.api.getSession({
        headers,
        ...(opts?.query ? { query: opts.query } : {}),
        ...(returnHeaders ? { returnHeaders: true } : {})
    });
    const user = extractSessionUser(session);
    const authContext = buildAuthContextFromUser(user);
    const setCookieHeaders = returnHeaders
        ? ((
              session as { headers?: { getSetCookie?: () => string[] } }
          )?.headers?.getSetCookie?.() ?? [])
        : [];

    return {
        authContext,
        user,
        setCookieHeaders
    };
}
