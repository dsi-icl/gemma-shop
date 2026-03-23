import '@tanstack/react-start/server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { env } from '@repo/env';

import { db } from './index';

const CONFIG_COLLECTION = 'config';
const ALGO = 'aes-256-gcm';
const KEY_BYTES = 32;

type SecretEnvelope = {
    alg: 'aes-256-gcm';
    iv: string;
    tag: string;
    ciphertext: string;
};

type ConfigDoc = {
    key: string;
    value?: unknown;
    encrypted?: boolean;
    secret?: SecretEnvelope;
    updatedAt: string;
    updatedBy: string;
    version: number;
};

function getKey(): Buffer {
    if (!env.SERVER_CONFIG_ENCRYPTION_KEY) {
        throw new Error(
            'SERVER_CONFIG_ENCRYPTION_KEY is required to encrypt/decrypt config secrets.'
        );
    }
    return createHash('sha256')
        .update(env.SERVER_CONFIG_ENCRYPTION_KEY, 'utf8')
        .digest()
        .subarray(0, KEY_BYTES);
}

function encryptValue(value: unknown): SecretEnvelope {
    const key = getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, key, iv);
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
        alg: 'aes-256-gcm',
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        ciphertext: encrypted.toString('base64')
    };
}

function decryptValue(envelope: SecretEnvelope): unknown {
    const key = getKey();
    const iv = Buffer.from(envelope.iv, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');

    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8'));
}

function collection() {
    return db.collection<ConfigDoc>(CONFIG_COLLECTION);
}

export async function getConfigValue<T>(key: string): Promise<T | null> {
    const doc = await collection().findOne({ key });
    if (!doc) return null;
    if (doc.encrypted && doc.secret) return decryptValue(doc.secret) as T;
    return (doc.value ?? null) as T | null;
}

export async function setConfigValue(input: {
    key: string;
    value: unknown;
    encrypted?: boolean;
    updatedBy: string;
}): Promise<void> {
    const now = new Date().toISOString();
    const prev = await collection().findOne({ key: input.key });
    const version = (prev?.version ?? 0) + 1;

    if (input.encrypted) {
        const secret = encryptValue(input.value);
        await collection().updateOne(
            { key: input.key },
            {
                $set: {
                    key: input.key,
                    encrypted: true,
                    secret,
                    value: null,
                    updatedAt: now,
                    updatedBy: input.updatedBy,
                    version
                }
            },
            { upsert: true }
        );
        return;
    }

    await collection().updateOne(
        { key: input.key },
        {
            $set: {
                key: input.key,
                encrypted: false,
                value: input.value,
                secret: null,
                updatedAt: now,
                updatedBy: input.updatedBy,
                version
            }
        },
        { upsert: true }
    );
}

export async function listConfigEntries(): Promise<
    Array<{
        key: string;
        encrypted: boolean;
        value: unknown;
        isSet: boolean;
        updatedAt: string;
        updatedBy: string;
        version: number;
    }>
> {
    const docs = await collection().find().sort({ key: 1 }).toArray();
    return docs.map((doc) => ({
        key: doc.key,
        encrypted: !!doc.encrypted,
        value: doc.encrypted ? null : (doc.value ?? null),
        isSet: doc.encrypted ? !!doc.secret : doc.value !== undefined && doc.value !== null,
        updatedAt: doc.updatedAt,
        updatedBy: doc.updatedBy,
        version: doc.version
    }));
}

export type SmtpConfig = {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
};

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
    const [host, port, secure, user, pass, from] = await Promise.all([
        getConfigValue<string>('smtp.host'),
        getConfigValue<number>('smtp.port'),
        getConfigValue<boolean>('smtp.secure'),
        getConfigValue<string>('smtp.user'),
        getConfigValue<string>('smtp.pass'),
        getConfigValue<string>('smtp.from')
    ]);

    if (!host || !port || !user || !pass || !from) {
        return null;
    }

    return {
        host,
        port,
        secure: !!secure,
        user,
        pass,
        from
    };
}
