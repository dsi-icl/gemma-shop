import '@tanstack/react-start/server-only';

interface UploadToken {
    projectId: string;
    userEmail: string;
    createdAt: number;
    expiresAt: number;
}

const TOKEN_TTL = 15 * 60 * 1000; // 15 minutes

// HMR-safe token store
const _hmr = (process as any).__UPLOAD_TOKENS_HMR__ ?? { tokens: new Map<string, UploadToken>() };
(process as any).__UPLOAD_TOKENS_HMR__ = _hmr;

const tokens: Map<string, UploadToken> = _hmr.tokens;

/** Create a short-lived upload token for a project. Returns the 8-char token string. */
export function createUploadToken(
    projectId: string,
    userEmail: string
): {
    token: string;
    expiresAt: number;
} {
    const token = crypto.randomUUID().slice(0, 8);
    const expiresAt = Date.now() + TOKEN_TTL;
    tokens.set(token, { projectId, userEmail, createdAt: Date.now(), expiresAt });
    return { token, expiresAt };
}

/** Validate a token. Returns the token data if valid, null if expired or unknown. */
export function validateUploadToken(
    token: string
): { projectId: string; userEmail: string } | null {
    const entry = tokens.get(token);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        tokens.delete(token);
        return null;
    }
    return { projectId: entry.projectId, userEmail: entry.userEmail };
}

/** Revoke a specific token (e.g. when dialog closes or editor disconnects). */
export function revokeUploadToken(token: string) {
    tokens.delete(token);
}
