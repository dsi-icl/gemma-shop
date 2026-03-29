import crypto from 'node:crypto';

import { createMiddleware, createStart } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';

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

export const startInstance = createStart(() => {
    return {
        requestMiddleware: [cspMiddleware]
    };
});
