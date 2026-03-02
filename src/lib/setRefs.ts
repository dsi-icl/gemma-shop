'use client';

import type { RefObject } from 'react';

export function setRefs<T>(element: T | null, ...refs: (React.Ref<T> | undefined)[]) {
    refs.forEach((ref) => {
        if (!ref) return;
        if (typeof ref === 'function') {
            ref(element);
        } else {
            (ref as RefObject<T | null>).current = element;
        }
    });
}
