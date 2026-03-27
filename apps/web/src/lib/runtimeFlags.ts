function isFalsyEnv(value: unknown): boolean {
    const normalized =
        typeof value === 'string'
            ? value
            : typeof value === 'number' || typeof value === 'boolean'
              ? `${value}`
              : '';
    return ['0', 'false', 'no', 'off'].includes(normalized.toLowerCase());
}

export const wsAllowPublicShim = !isFalsyEnv(import.meta.env.VITE_WS_ALLOW_PUBLIC_SHIM ?? 'true');

export const wsEnrollmentFallbackEnabled = !wsAllowPublicShim;
