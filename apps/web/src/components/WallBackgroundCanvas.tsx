'use client';

import { useEffect, useRef } from 'react';

import {
    BACKGROUND_T_SPEED,
    BACKGROUND_TICK_MS,
    renderBackgroundNoise
} from '~/lib/backgroundNoise';
import { renderBackgroundWaves } from '~/lib/backgroundWave';
import { SCREEN_H, SCREEN_W } from '~/lib/stageConstants';
import type { Layer } from '~/lib/types';

type BackgroundLayer = Extract<Layer, { type: 'background' }>;

interface WallBackgroundCanvasProps {
    layer: BackgroundLayer;
    col: number;
    row: number;
}

export function WallBackgroundCanvas({ layer, col, row }: WallBackgroundCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const draw = () => {
            // t is derived from wall-clock time so all screens are always in sync.
            // Tiny increments mean adjacent frames are nearly identical → smooth drift.
            const t = (Date.now() / 1000) * BACKGROUND_T_SPEED * layer.speedFactor;
            if (layer.backgroundType === 'waves') {
                renderBackgroundWaves(canvasRef.current!, layer, col, row, t);
            } else {
                renderBackgroundNoise(canvasRef.current!, layer, col, row, t);
            }
        };

        draw();
        // Scale the redraw interval inversely with speedFactor so the
        // animation stays smooth regardless of how fast the noise advances.
        const tickMs = Math.max(200, BACKGROUND_TICK_MS / layer.speedFactor);
        const id = setInterval(draw, tickMs);
        return () => clearInterval(id);
    }, [
        layer.backgroundType,
        layer.backgroundColor,
        layer.atmosphereColor,
        layer.motifColor1,
        layer.motifColor2,
        layer.noiseSeed,
        layer.speedFactor,
        col,
        row
    ]);

    return (
        <canvas
            ref={canvasRef}
            width={SCREEN_W}
            height={SCREEN_H}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${SCREEN_W}px`,
                height: `${SCREEN_H}px`,
                zIndex: 0,
                imageRendering: 'auto',
                pointerEvents: 'none'
            }}
        />
    );
}
