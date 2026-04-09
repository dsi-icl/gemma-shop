import { formatDistanceToNow } from 'date-fns';
import { useEffect, useState } from 'react';

type DateDisplayProps = {
    value: unknown;
    fallback?: string;
    className?: string;
    updateIntervalMs?: number;
    addSuffix?: boolean;
    title?: boolean;
};

function parseEpochValue(input: unknown): Date | null {
    if (input instanceof Date) {
        return Number.isNaN(input.getTime()) ? null : input;
    }

    if (typeof input === 'number' && Number.isFinite(input)) {
        const epochMs = input < 1e12 ? input * 1000 : input;
        const date = new Date(epochMs);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof input === 'string') {
        const trimmed = input.trim();
        if (!trimmed) return null;
        if (/^\d+$/.test(trimmed)) {
            const numeric = Number(trimmed);
            if (!Number.isFinite(numeric)) return null;
            const epochMs = numeric < 1e12 ? numeric * 1000 : numeric;
            const date = new Date(epochMs);
            return Number.isNaN(date.getTime()) ? null : date;
        }
        const date = new Date(trimmed);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
}

export function DateDisplay({
    value,
    fallback = '—',
    className,
    updateIntervalMs = 30_000,
    addSuffix = true,
    title = true
}: DateDisplayProps) {
    const parsed = parseEpochValue(value);
    const [, setTick] = useState(0);

    useEffect(() => {
        if (!parsed) return;
        const id = window.setInterval(() => {
            setTick((prev) => prev + 1);
        }, updateIntervalMs);
        return () => window.clearInterval(id);
    }, [parsed, updateIntervalMs]);

    if (!parsed) {
        return <span className={className}>{fallback}</span>;
    }

    const display = formatDistanceToNow(parsed, { addSuffix });
    const dateTime = parsed.toISOString();
    const titleText = parsed.toLocaleString();

    return (
        <time className={className} dateTime={dateTime} title={title ? titleText : undefined}>
            {display}
        </time>
    );
}
