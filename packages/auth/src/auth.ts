import '@tanstack/react-start/server-only';
import { render } from '@react-email/render';
import { db } from '@repo/db';
import { MagicLinkEmail } from '@repo/emails/MagicLinkEmail';
import { OtpEmail } from '@repo/emails/OtpEmail';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { betterAuth } from 'better-auth/minimal';
import { admin, emailOTP, magicLink } from 'better-auth/plugins';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
// import nodemailer from 'nodemailer';

// const transporter = nodemailer.createTransport({
//     host: process.env.SMTP_HOST,
//     port: parseInt(process.env.SMTP_PORT || '587'),
//     secure: process.env.SMTP_SECURE === 'true',
//     auth: {
//         user: process.env.SMTP_USER,
//         pass: process.env.SMTP_PASS
//     }
// });

// const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@gemma-cast.local';

const allowedHosts = process.env.ALLOWED_HOSTS
    ? process.env.ALLOWED_HOSTS.split(',').map((s) => s.trim())
    : ['http://localhost:3670'];
const trustedOrigins = process.env.TRUSTED_ORIGINS
    ? process.env.TRUSTED_ORIGINS.split(',').map((s) => s.trim())
    : ['http://localhost:3670'];

export const auth = betterAuth({
    baseURL: {
        allowedHosts,
        fallback: allowedHosts[0]
    },
    trustedOrigins,
    secret: process.env.SERVER_AUTH_SECRET,
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
                console.log(`Magic Link to ${email} : (${token}) : ${url}`);
                // const html = await render(MagicLinkEmail({ url }));
                // await transporter.sendMail({
                //     from: FROM_EMAIL,
                //     to: email,
                //     subject: 'Sign in to Gemma Cast',
                //     html
                // });
            }
        }),
        emailOTP({
            sendVerificationOTP: async ({ email, otp, type }) => {
                console.log(`OTP to ${email} : ${otp} (${type})`);
                // const html = await render(OtpEmail({ otp }));
                // await transporter.sendMail({
                //     from: FROM_EMAIL,
                //     to: email,
                //     subject: 'Your Gemma Cast OTP',
                //     html
                // });
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
