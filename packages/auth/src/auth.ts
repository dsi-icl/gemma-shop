import '@tanstack/react-start/server-only';
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { db } from '@repo/db';
import * as schema from '@repo/db/schema';
import { betterAuth } from 'better-auth/minimal';
import { magicLink } from 'better-auth/plugins';
import { tanstackStartCookies } from 'better-auth/tanstack-start';

export const auth = betterAuth({
    baseURL: process.env.VITE_BASE_URL,
    secret: process.env.SERVER_AUTH_SECRET,
    telemetry: {
        enabled: false
    },
    database: drizzleAdapter(db, {
        provider: 'pg',
        schema
    }),

    // https://www.better-auth.com/docs/integrations/tanstack#usage-tips
    plugins: [
        tanstackStartCookies(),
        magicLink({
            sendMagicLink: async ({ email, token, url }, ctx) => {
                console.log(`Email Sent to ${email} : (${token}) : ${url}`);
            }
        })
    ],

    // https://www.better-auth.com/docs/concepts/session-management#session-caching
    session: {
        cookieCache: {
            enabled: true,
            maxAge: 5 * 60 // 5 minutes
        }
    },

    // // https://www.better-auth.com/docs/concepts/oauth
    // socialProviders: {
    //     github: {
    //         clientId: process.env.SERVER_GITHUB_CLIENT_ID!,
    //         clientSecret: process.env.SERVER_GITHUB_CLIENT_SECRET!
    //     },
    //     google: {
    //         clientId: process.env.SERVER_GOOGLE_CLIENT_ID!,
    //         clientSecret: process.env.SERVER_GOOGLE_CLIENT_SECRET!
    //     }
    // },

    // // https://www.better-auth.com/docs/authentication/email-password
    // emailAndPassword: {
    //     enabled: true
    // },

    experimental: {
        // https://www.better-auth.com/docs/adapters/drizzle#joins-experimental
        joins: true
    }
});
