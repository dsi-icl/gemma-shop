import { useEffect } from 'react';
import { useSyncExternalStore } from 'react';

type LastInputType = 'touch' | 'mouse' | 'pen' | 'keyboard';

function getCapabilities() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return {
            hasTouch: false,
            hasHover: false,
            hasCoarsePointer: false
        };
    }

    const hasTouch =
        navigator.maxTouchPoints > 0 || window.matchMedia('(any-pointer: coarse)').matches;
    const hasHover = window.matchMedia('(any-hover: hover)').matches;
    const hasCoarsePointer = window.matchMedia('(any-pointer: coarse)').matches;

    return { hasTouch, hasHover, hasCoarsePointer };
}

function applyCapabilityClasses(root: HTMLElement) {
    const { hasTouch, hasHover, hasCoarsePointer } = getCapabilities();
    const isTouchOnly = hasTouch && !hasHover;

    root.classList.toggle('input-has-touch', hasTouch);
    root.classList.toggle('input-has-hover', hasHover);
    root.classList.toggle('input-has-coarse-pointer', hasCoarsePointer);
    root.classList.toggle('input-touch-only', isTouchOnly);
}

function setLastInputClass(root: HTMLElement, next: LastInputType) {
    root.classList.remove(
        'last-input-touch',
        'last-input-mouse',
        'last-input-pen',
        'last-input-keyboard'
    );
    root.classList.add(`last-input-${next}`);
}

export function useInputModeClasses() {
    useEffect(() => {
        const root = document.documentElement;
        applyCapabilityClasses(root);

        const hoverMql = window.matchMedia('(any-hover: hover)');
        const coarseMql = window.matchMedia('(any-pointer: coarse)');
        const onCapabilitiesChanged = () => applyCapabilityClasses(root);

        hoverMql.addEventListener('change', onCapabilitiesChanged);
        coarseMql.addEventListener('change', onCapabilitiesChanged);

        const onPointerDown = (event: PointerEvent) => {
            const pointerType = event.pointerType;
            if (pointerType === 'touch' || pointerType === 'mouse' || pointerType === 'pen') {
                setLastInputClass(root, pointerType);
            }
        };

        const onKeyDown = () => setLastInputClass(root, 'keyboard');

        window.addEventListener('pointerdown', onPointerDown, { passive: true });
        window.addEventListener('keydown', onKeyDown, { passive: true });

        return () => {
            hoverMql.removeEventListener('change', onCapabilitiesChanged);
            coarseMql.removeEventListener('change', onCapabilitiesChanged);
            window.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, []);
}

function subscribeCapabilities(callback: () => void) {
    if (typeof window === 'undefined') {
        return () => {};
    }
    const hoverMql = window.matchMedia('(any-hover: hover)');
    const coarseMql = window.matchMedia('(any-pointer: coarse)');
    hoverMql.addEventListener('change', callback);
    coarseMql.addEventListener('change', callback);
    return () => {
        hoverMql.removeEventListener('change', callback);
        coarseMql.removeEventListener('change', callback);
    };
}

function getTouchOnlySnapshot() {
    const { hasTouch, hasHover } = getCapabilities();
    return hasTouch && !hasHover;
}

export function useIsTouchOnlyDevice() {
    return useSyncExternalStore(subscribeCapabilities, getTouchOnlySnapshot, () => false);
}
