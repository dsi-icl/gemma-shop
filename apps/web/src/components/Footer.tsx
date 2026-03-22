import { Clock } from '@repo/ui/components/clock';
import { useLocation } from '@tanstack/react-router';
import { useMemo } from 'react';

export function Footer() {
    const searchStr = useLocation({
        select: (location) => location.searchStr
    });

    const mountLocation = useMemo(() => {
        const params = new URLSearchParams(searchStr);
        return params.get('l');
    }, [searchStr]);

    if (mountLocation === 'gallery' || mountLocation === 'wall') return null;

    return (
        <footer className="absolute bottom-0 left-0 flex w-full items-center justify-between gap-2 p-4 text-sm text-accent">
            <span className="grow">© 2026 Data Science Imperial. All rights reserved.</span>
            <Clock />
        </footer>
    );
}
