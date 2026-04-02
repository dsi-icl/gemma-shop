import crypto from 'node:crypto';

import { createMiddleware, createStart } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';

import { logAuditDenied } from '~/server/audit';
import {
    buildRateLimitSubjectKey,
    checkRateLimit,
    getClientIpFromHeaders
} from '~/server/rateLimit';
import { resolveRequestAuthContext } from '~/server/requestAuthContext';

const startRateLimitMiddleware = createMiddleware().server(async ({ next, request }) => {
    const method = request.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        return next();
    }

    const url = new URL(request.url);
    // Dedicated API routes keep their own route-specific policies.
    if (url.pathname.startsWith('/api/')) {
        return next();
    }

    const ip = getClientIpFromHeaders(request.headers);
    const subjectKey = buildRateLimitSubjectKey({ ip });
    const rate = checkRateLimit({
        subjectKey
    });

    if (rate.allowed) return next();

    void logAuditDenied({
        action: 'START_ROUTE_RATE_LIMITED',
        resourceType: 'start_route',
        resourceId: `${method}:${url.pathname}`,
        reasonCode: 'RATE_LIMITED',
        changes: { retryAfterMs: rate.retryAfterMs, ip }
    });

    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000))
        }
    });
});

const cspMiddleware = createMiddleware().server(({ next, request }) => {
    if (request.method !== 'GET') {
        return next();
    }

    const isDev = import.meta.env.DEV;
    const nonce = crypto.randomBytes(16).toString('base64');
    const reportUrl = new URL('/api/report-csp', request.url).toString();
    const scriptSrc = [
        "'strict-dynamic'",
        `'nonce-${nonce}'`,
        ...(isDev ? ["'unsafe-eval'"] : [])
    ].join(' ');
    const connectSrc = ["'self'", 'ws:', 'wss:', 'https:', ...(isDev ? ['http:'] : [])].join(' ');
    const frameSrc = ["'self'", 'https:', ...(isDev ? ['http:'] : [])].join(' ');
    const styleSrcElem = isDev ? "'self' 'unsafe-inline'" : `'self' 'nonce-${nonce}'`;
    const directives = [
        'upgrade-insecure-requests',
        "default-src 'none'",
        "base-uri 'self'",
        "object-src 'none'",
        "form-action 'self'",
        `connect-src ${connectSrc}`,
        "manifest-src 'self'",
        `frame-src ${frameSrc}`,
        "img-src 'self' data: blob: https:",
        `media-src 'self' data: blob: https:${isDev ? ' http:' : ''}`,
        `font-src 'self' data: https:${isDev ? ' http:' : ''}`,
        "worker-src 'self' blob:",
        `script-src ${scriptSrc}`,
        `style-src ${styleSrcElem}`,
        `style-src-elem ${styleSrcElem}`,
        "style-src-attr 'unsafe-inline'",
        `report-uri ${reportUrl}`,
        'report-to csp-endpoint'
    ].join('; ');

    const headerName = isDev ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
    setResponseHeader(headerName, directives);
    setResponseHeader('Reporting-Endpoints', `csp-endpoint="${reportUrl}"`);
    setResponseHeader(
        'Report-To',
        JSON.stringify({
            group: 'csp-endpoint',
            max_age: 60 * 60 * 24,
            endpoints: [{ url: reportUrl }]
        })
    );

    return next({
        context: { nonce }
    });
});

const authContextMiddleware = createMiddleware().server(async ({ next, request, context }) => {
    const resolved = await resolveRequestAuthContext(request);
    return next({
        context: {
            nonce: undefined,
            ...(context ?? {}),
            authContext: resolved.authContext,
            user: resolved.user
        }
    });
});

export const startInstance = createStart(() => {
    return {
        requestMiddleware: [startRateLimitMiddleware, cspMiddleware, authContextMiddleware]
    };
});
