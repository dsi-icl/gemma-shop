import { useEffect, useState } from 'react';

const TABLET_MAX = 1024;
const TABLET_MIN = 768;

function hasTouchScreen() {
    if (typeof navigator === 'undefined') return false;
    return navigator.maxTouchPoints > 0;
}

/**
 * Detects tablet-like devices: touch-capable with a viewport between 768px and 1024px,
 * or any touch device that isn't a narrow phone (>=768px).
 */
export function useIsTablet() {
    const [isTablet, setIsTablet] = useState(false);

    useEffect(() => {
        const check = () => {
            const w = window.innerWidth;
            setIsTablet(hasTouchScreen() && w >= TABLET_MIN && w <= TABLET_MAX);
        };
        check();

        const mql = window.matchMedia(
            `(min-width: ${TABLET_MIN}px) and (max-width: ${TABLET_MAX}px)`
        );
        const onChange = () => check();
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, []);

    return isTablet;
}
