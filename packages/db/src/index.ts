import '@tanstack/react-start/server-only';
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.SERVER_DATABASE_URL as string);

export const db = client.db();
