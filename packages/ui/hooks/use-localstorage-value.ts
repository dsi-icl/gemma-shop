'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export function useLocalStorageValue<T extends string>(key: string, defaultValue: T) {
    const [value, setValue] = useState<T>(() => {
        if (typeof window === 'undefined') return defaultValue;
        const saved = localStorage.getItem(key);
        return saved !== null ? (saved as T) : defaultValue;
    });

    // This ref helps us ignore events we triggered ourselves
    const isBroadcasting = useRef(false);

    const setStoredValue = useCallback(
        (newValue: T) => {
            if (typeof window === 'undefined') return;
            localStorage.setItem(key, newValue);
            setValue(newValue);

            // Set the flag, dispatch, then reset after the event loop tick
            isBroadcasting.current = true;
            window.dispatchEvent(new Event('local-storage-update'));
            isBroadcasting.current = false;
        },
        [key]
    );

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const updateState = () => {
            // If THIS instance triggered the change, don't update state again
            if (isBroadcasting.current) return;

            const saved = localStorage.getItem(key);
            const current = saved !== null ? (saved as T) : defaultValue;

            setValue(current);
        };

        window.addEventListener('local-storage-update', updateState);
        window.addEventListener('storage', updateState);

        return () => {
            window.removeEventListener('local-storage-update', updateState);
            window.removeEventListener('storage', updateState);
        };
    }, [key, defaultValue]);

    return [value, setStoredValue] as const;
}
