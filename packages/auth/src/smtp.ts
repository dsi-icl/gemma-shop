import '@tanstack/react-start/server-only';
import type { SmtpConfig } from '@repo/db/config';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export type SmtpTransportInput = Pick<
    SmtpConfig,
    | 'host'
    | 'port'
    | 'secure'
    | 'requireTLS'
    | 'ignoreTLS'
    | 'connectionTimeoutMs'
    | 'user'
    | 'pass'
    | 'tlsRejectUnauthorized'
    | 'tlsServername'
>;

export function buildSmtpTransportOptions(smtp: SmtpTransportInput): SMTPTransport.Options {
    return {
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        requireTLS: smtp.requireTLS,
        ignoreTLS: smtp.ignoreTLS,
        connectionTimeout: smtp.connectionTimeoutMs,
        auth: {
            user: smtp.user,
            pass: smtp.pass
        },
        tls: {
            rejectUnauthorized: smtp.tlsRejectUnauthorized,
            ...(smtp.tlsServername ? { servername: smtp.tlsServername } : {})
        }
    };
}

export async function createSmtpTransport(smtp: SmtpTransportInput): Promise<Transporter> {
    const nodemailer = await import('nodemailer');
    const options = buildSmtpTransportOptions(smtp);

    return nodemailer.default.createTransport(options);
}
