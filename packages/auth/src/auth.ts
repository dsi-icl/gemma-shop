import '@tanstack/react-start/server-only';
import { db } from '@repo/db';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { betterAuth } from 'better-auth/minimal';
import { emailOTP, magicLink } from 'better-auth/plugins';
import { tanstackStartCookies } from 'better-auth/tanstack-start';

export const auth = betterAuth({
    baseURL: process.env.VITE_BASE_URL,
    secret: process.env.SERVER_AUTH_SECRET,
    telemetry: {
        enabled: false
    },
    database: mongodbAdapter(db),

    // https://www.better-auth.com/docs/integrations/tanstack#usage-tips
    plugins: [
        tanstackStartCookies(),
        magicLink({
            sendMagicLink: async ({ email, token, url }, ctx) => {
                console.log(`Magic Link to ${email} : (${token}) : ${url}`);
            }
        }),
        emailOTP({
            sendVerificationOTP: async ({ email, otp, type }) => {
                console.log(`OTP to ${email} : ${otp} (${type})`);
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
