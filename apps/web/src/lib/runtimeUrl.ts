const DEFAULT_HTTP_BASE_URL = 'http://localhost:3000';

function getConfiguredHttpBaseUrl(): string {
    const raw = process.env.VITE_BASE_URL;
    if (typeof raw === 'string' && /^https?:\/\//.test(raw)) return raw;
    return DEFAULT_HTTP_BASE_URL;
}

export function getHttpBaseUrl(): string {
    if (typeof window !== 'undefined') return window.location.origin;
    return getConfiguredHttpBaseUrl();
}

export function getWebSocketUrl(path: string): string {
    const base = new URL(getHttpBaseUrl());
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    base.pathname = path.startsWith('/') ? path : `/${path}`;
    base.search = '';
    base.hash = '';
    return base.toString();
}
