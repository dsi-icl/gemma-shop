import { Clock } from '@repo/ui/components/clock';
import { useMemo } from 'react';

export function Footer() {
    const isClient = typeof window !== 'undefined';
    const mountLocation = useMemo(() => {
        if (!isClient) return undefined;
        const params = new URLSearchParams(window.location.search);
        return params.get('l');
    }, [isClient]);

    if (mountLocation === 'gallery') return null;

    return (
        <footer className="absolute bottom-0 left-0 flex w-full items-center justify-between gap-2 p-4 text-sm text-accent">
            <span className="grow">© 2026 Data Science Imperial. All rights reserved.</span>
            <Clock />
        </footer>
    );
}
