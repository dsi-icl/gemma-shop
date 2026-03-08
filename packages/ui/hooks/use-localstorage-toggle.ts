'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export function useLocalStorageToggle(key: string, defaultValue = false) {
    const [value, setValue] = useState(() => {
        if (typeof window === 'undefined') return false;
        const saved = localStorage.getItem(key);
        return saved !== null ? (JSON.parse(saved) as boolean) : defaultValue;
    });

    // This ref helps us ignore events we triggered ourselves
    const isBroadcasting = useRef(false);

    const toggle = useCallback(() => {
        if (typeof window === 'undefined') return;
        setValue((prev) => {
            const newValue = !prev;
            localStorage.setItem(key, JSON.stringify(newValue));

            // Set the flag, dispatch, then reset after the event loop tick
            isBroadcasting.current = true;
            window.dispatchEvent(new Event('local-storage-update'));
            isBroadcasting.current = false;

            return newValue;
        });
    }, [key]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const updateState = () => {
            // If THIS instance triggered the change, don't update state again
            if (isBroadcasting.current) return;

            const saved = localStorage.getItem(key);
            const current = saved !== null ? (JSON.parse(saved) as boolean) : defaultValue;

            setValue(current);
        };

        window.addEventListener('local-storage-update', updateState);
        window.addEventListener('storage', updateState);

        return () => {
            window.removeEventListener('local-storage-update', updateState);
            window.removeEventListener('storage', updateState);
        };
    }, [key, defaultValue]);

    return [value, toggle] as const;
}
