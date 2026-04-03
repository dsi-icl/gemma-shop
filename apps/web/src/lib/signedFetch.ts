'use client';

import type { DeviceKind } from './deviceIdentity';
import { buildDeviceSignatureHeaders } from './requestSigning';

function mergeHeaders(base: HeadersInit | undefined, extra: Record<string, string>): Headers {
    const headers = new Headers(base);
    for (const [k, v] of Object.entries(extra)) headers.set(k, v);
    return headers;
}

export async function signedFetch(
    input: string | URL | Request,
    init?: RequestInit,
    opts?: { deviceKind?: DeviceKind; wallId?: string; fetchImpl?: typeof fetch }
): Promise<Response> {
    const fetchImpl = opts?.fetchImpl ?? fetch;
    if (!opts?.deviceKind || typeof window === 'undefined') {
        return fetchImpl(input, init);
    }

    const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method =
        (init?.method ??
            (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET')) ||
        'GET';

    const signatureHeaders = await buildDeviceSignatureHeaders({
        deviceKind: opts.deviceKind,
        wallId: opts.wallId,
        url,
        method,
        init
    });

    const mergedInit: RequestInit = {
        ...(init ?? {}),
        headers: mergeHeaders(init?.headers, signatureHeaders)
    };

    return fetchImpl(input, mergedInit);
}

export function createSignedServerFnFetch(input: { deviceKind: DeviceKind; wallId?: string }) {
    const wrapped = ((url: RequestInfo | URL, init?: RequestInit) =>
        signedFetch(url as any, init, {
            deviceKind: input.deviceKind,
            wallId: input.wallId
        })) as typeof fetch;
    (wrapped as any).preconnect = (fetch as any).preconnect;
    return wrapped;
}
