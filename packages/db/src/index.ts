import '@tanstack/react-start/server-only';
import { env } from '@repo/env';
import { Db, MongoClient } from 'mongodb';

const FALLBACK_DB_ERROR = 'Database is unavailable because SERVER_DATABASE_URL is not configured.';

let dbInstance: Db;

if (env.SERVER_DATABASE_URL) {
    const client = new MongoClient(env.SERVER_DATABASE_URL);
    dbInstance = client.db();
} else {
    const unavailable = () => {
        throw new Error(FALLBACK_DB_ERROR);
    };

    dbInstance = {
        collection: unavailable,
        command: unavailable
    } as unknown as Db;
}

export const db = dbInstance;
