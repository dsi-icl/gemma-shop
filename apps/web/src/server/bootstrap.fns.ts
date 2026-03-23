import { freshAuthMiddleware } from '@repo/auth/tanstack/middleware';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import {
    finalizeFirstAdminForUser,
    getBootstrapStatus,
    requestBootstrapSetupCodeDisplay,
    submitBootstrapAdminAndSmtp,
    verifyBootstrapOtpAndFinalize,
    verifyBootstrapSetupCode
} from './bootstrap';

export const $bootstrapStatus = createServerFn({ method: 'GET' }).handler(async () =>
    getBootstrapStatus()
);

export const $requestBootstrapSetupCodeDisplay = createServerFn({ method: 'POST' }).handler(
    async () => requestBootstrapSetupCodeDisplay()
);

export const $verifyBootstrapSetupCode = createServerFn({ method: 'POST' })
    .inputValidator(
        z.object({
            code: z.string().min(1)
        })
    )
    .handler(async ({ data }) => verifyBootstrapSetupCode({ code: data.code }));

export const $submitBootstrapAdminAndSmtp = createServerFn({ method: 'POST' })
    .inputValidator(
        z.object({
            adminEmail: z.email(),
            smtp: z.object({
                host: z.string().min(1),
                port: z.number().int().positive(),
                secure: z.boolean(),
                requireTLS: z.boolean(),
                ignoreTLS: z.boolean(),
                tlsRejectUnauthorized: z.boolean(),
                tlsServername: z.string(),
                connectionTimeoutMs: z.number().int().positive(),
                user: z.string().min(1),
                pass: z.string().min(1),
                from: z.email()
            })
        })
    )
    .handler(async ({ data }) =>
        submitBootstrapAdminAndSmtp({
            adminEmail: data.adminEmail,
            smtp: data.smtp
        })
    );

export const $verifyBootstrapOtpAndFinalize = createServerFn({ method: 'POST' })
    .inputValidator(
        z.object({
            otp: z.string().min(1)
        })
    )
    .handler(async ({ data }) => verifyBootstrapOtpAndFinalize({ otp: data.otp }));

export const $finalizeFirstAdminForCurrentUser = createServerFn({ method: 'POST' })
    .middleware([freshAuthMiddleware])
    .handler(async ({ context }) =>
        finalizeFirstAdminForUser({
            userId: (context.user as any)?.id ?? null,
            email: context.user.email
        })
    );
