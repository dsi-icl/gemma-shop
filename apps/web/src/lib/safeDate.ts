import { format as formatDateFns } from 'date-fns';

export function parseDateValue(input: unknown): Date | null {
    if (input instanceof Date) {
        return Number.isNaN(input.getTime()) ? null : input;
    }
    if (typeof input === 'string' || typeof input === 'number') {
        const parsed = new Date(input);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
}

export function toLocalDateString(input: unknown, fallback = '—'): string {
    const parsed = parseDateValue(input);
    return parsed ? parsed.toLocaleDateString() : fallback;
}

export function toLocalDateTimeString(input: unknown, fallback = '—'): string {
    const parsed = parseDateValue(input);
    return parsed ? parsed.toLocaleString() : fallback;
}

export function formatDateValue(input: unknown, pattern: string, fallback = '—'): string {
    const parsed = parseDateValue(input);
    if (!parsed) return fallback;
    try {
        return formatDateFns(parsed, pattern);
    } catch {
        return fallback;
    }
}
