'use client';

import * as React from 'react';

import { Slider } from './slider';

type SymmetricSliderProps = {
    value: number;
    onValueChange: (value: number) => void;
    onInteractionChange?: (active: boolean) => void;
    min?: number;
    max?: number;
    step?: number;
    className?: string;
};

/**
 * Dynamic window centered around current value, constrained by [min, max].
 * For value=50 with min=10, this yields [10, 90].
 * For value=90 with min=10, this yields [10, 170].
 */
export function SymmetricSlider({
    value,
    onValueChange,
    onInteractionChange,
    min = 0,
    max = 100,
    step = 1,
    className
}: SymmetricSliderProps) {
    const clampedValue = Math.min(max, Math.max(min, value));
    const [windowCenter, setWindowCenter] = React.useState(clampedValue);
    const [isInteracting, setIsInteracting] = React.useState(false);

    React.useEffect(() => {
        if (!isInteracting) setWindowCenter(clampedValue);
    }, [clampedValue, isInteracting]);

    const halfRange = Math.max(step * 10, windowCenter - min);
    const dynamicMin = Math.max(min, Math.round(windowCenter - halfRange));
    const dynamicMax = Math.min(max, Math.round(windowCenter + halfRange));

    return (
        <div
            onPointerDownCapture={() => {
                setIsInteracting(true);
                onInteractionChange?.(true);
            }}
            onPointerUpCapture={() => {
                setIsInteracting(false);
                setWindowCenter(clampedValue);
                onInteractionChange?.(false);
            }}
            onPointerCancelCapture={() => {
                setIsInteracting(false);
                setWindowCenter(clampedValue);
                onInteractionChange?.(false);
            }}
        >
            <Slider
                className={className}
                value={[clampedValue]}
                min={dynamicMin}
                max={dynamicMax}
                step={step}
                onValueChange={(next) => onValueChange(Array.isArray(next) ? next[0] : next)}
                onValueCommitted={(next) => {
                    const committed = Array.isArray(next) ? next[0] : next;
                    const clampedCommitted = Math.min(max, Math.max(min, committed));
                    setIsInteracting(false);
                    setWindowCenter(clampedCommitted);
                    onInteractionChange?.(false);
                }}
            />
        </div>
    );
}
