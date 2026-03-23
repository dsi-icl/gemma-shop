import '@tanstack/react-start/server-only';
import { render } from '@react-email/render';
import { db } from '@repo/db';
import { getSmtpConfig } from '@repo/db/config';
import { MagicLinkEmail } from '@repo/emails/MagicLinkEmail';
import { OtpEmail } from '@repo/emails/OtpEmail';
import { env, splitCsv } from '@repo/env';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { betterAuth } from 'better-auth/minimal';
import { admin, emailOTP, magicLink } from 'better-auth/plugins';
import { tanstackStartCookies } from 'better-auth/tanstack-start';

import { createSmtpTransport } from './smtp';

const allowedHosts = splitCsv(env.ALLOWED_HOSTS);
const trustedOrigins = splitCsv(env.TRUSTED_ORIGINS);
const safeAllowedHosts = allowedHosts.length > 0 ? allowedHosts : [env.VITE_BASE_URL];
const safeTrustedOrigins = trustedOrigins.length > 0 ? trustedOrigins : [env.VITE_BASE_URL];

async function sendAuthEmail(input: {
    to: string;
    subject: string;
    html: string;
    fallbackLog: string;
}) {
    try {
        const smtp = await getSmtpConfig();
        if (!smtp) {
            console.warn(`[AuthMail] SMTP config missing in DB. ${input.fallbackLog}`);
            return;
        }

        const transporter = await createSmtpTransport(smtp);

        await transporter.sendMail({
            from: smtp.from,
            to: input.to,
            subject: input.subject,
            html: input.html
        });
    } catch (err) {
        console.error('[AuthMail] send failed', err, input.fallbackLog);
    }
}

export const auth = betterAuth({
    baseURL: {
        allowedHosts: safeAllowedHosts,
        fallback: safeAllowedHosts[0]
    },
    trustedOrigins: safeTrustedOrigins,
    secret: env.SERVER_AUTH_SECRET || 'degraded-mode-secret',
    telemetry: {
        enabled: false
    },
    database: mongodbAdapter(db),

    // https://www.better-auth.com/docs/integrations/tanstack#usage-tips
    plugins: [
        tanstackStartCookies(),
        admin(),
        magicLink({
            sendMagicLink: async ({ email, token, url }) => {
                const html = await render(MagicLinkEmail({ url }));
                await sendAuthEmail({
                    to: email,
                    subject: 'Sign in to Gemma Shop',
                    html,
                    fallbackLog: `Magic Link to ${email} : (${token}) : ${url}`
                });
            }
        }),
        emailOTP({
            sendVerificationOTP: async ({ email, otp, type }) => {
                const html = await render(OtpEmail({ otp }));
                await sendAuthEmail({
                    to: email,
                    subject: 'Your Gemma Shop OTP',
                    html,
                    fallbackLog: `OTP to ${email} : ${otp} (${type})`
                });
            }
        })
    ],

    // https://www.better-auth.com/docs/concepts/session-management#session-caching
    session: {
        cookieCache: {
            enabled: true,
            maxAge: 5 * 60 // 5 minutes
        }
    }
});
