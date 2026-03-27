import { ObjectId } from 'mongodb';

export function serializeForClient<T>(value: T): T {
    if (value instanceof ObjectId) {
        return value.toHexString() as T;
    }
    if (value instanceof Date) {
        return value.toISOString() as T;
    }
    if (Array.isArray(value)) {
        return value.map((item) => serializeForClient(item)) as T;
    }
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = serializeForClient(v);
        }
        return out as T;
    }
    return value;
}

export function toIdString(value: unknown): string {
    if (value instanceof ObjectId) return value.toHexString();
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '';
    return JSON.stringify(value);
}

export function toScalarString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return `${value}`;
    }
    if (value === null || value === undefined) return '';
    return JSON.stringify(value);
}
