import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'react-konva';

import { BACKGROUND_T_SPEED, renderBackgroundNoise } from '~/lib/backgroundNoise';
import { renderBackgroundParticle } from '~/lib/backgroundParticle';
import { renderBackgroundWaves } from '~/lib/backgroundWave';
import { COLS, ROWS, SCREEN_H, SCREEN_W } from '~/lib/stageConstants';
import type { Layer } from '~/lib/types';

const WALL_W = COLS * SCREEN_W;
const WALL_H = ROWS * SCREEN_H;
const MAX_PREVIEW_W = 4096;

type BackgroundLayer = Extract<Layer, { type: 'background' }>;

interface KonvaBackgroundLayerProps {
    layer: BackgroundLayer;
    previewScale: number;
}

/**
 * Static noise snapshot rendered as a Konva Image covering the full wall.
 * Non-interactive — click/drag pass through to layers below.
 */
function KonvaBackgroundLayerInner({ layer, previewScale }: KonvaBackgroundLayerProps) {
    const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
    const renderedWidthRef = useRef(0);
    const lastConfigKeyRef = useRef('');

    const previewWidthBucket = useMemo(() => {
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        const requested = Math.round(WALL_W * Math.max(previewScale, 0.001) * dpr);
        const minWidth = 1536;
        const clamped = Math.max(minWidth, Math.min(MAX_PREVIEW_W, requested));
        // Quantize so tiny scale jitter doesn't trigger redraws.
        return Math.min(MAX_PREVIEW_W, Math.ceil(clamped / 256) * 256);
    }, [previewScale]);

    useEffect(() => {
        const configKey = [
            layer.backgroundType,
            layer.backgroundColor,
            layer.atmosphereColor,
            layer.motifColor1,
            layer.motifColor2,
            layer.noiseSeed,
            layer.speedFactor
        ].join('|');
        const configChanged = configKey !== lastConfigKeyRef.current;
        const needsSharperRaster = previewWidthBucket > renderedWidthRef.current;

        if (!configChanged && !needsSharperRaster && canvas) return;

        const offscreen = document.createElement('canvas');
        offscreen.width = Math.max(previewWidthBucket, renderedWidthRef.current || 0);
        offscreen.height = Math.max(1, Math.round((offscreen.width * WALL_H) / WALL_W));
        // Use current wall-clock t (same formula as WallBackgroundCanvas) so
        // the preview matches what the wall is showing right now.
        const t = (Date.now() / 1000) * BACKGROUND_T_SPEED * layer.speedFactor;
        if (layer.backgroundType === 'solid') {
            const ctx = offscreen.getContext('2d');
            if (ctx) {
                ctx.fillStyle = layer.backgroundColor;
                ctx.fillRect(0, 0, offscreen.width, offscreen.height);
            }
        } else if (layer.backgroundType === 'waves') {
            renderBackgroundWaves(offscreen, layer, 0, 0, t, COLS, ROWS);
        } else if (layer.backgroundType === 'particle') {
            renderBackgroundParticle(offscreen, layer, 0, 0, t, COLS, ROWS);
        } else {
            renderBackgroundNoise(offscreen, layer, 0, 0, t, COLS, ROWS);
        }
        renderedWidthRef.current = offscreen.width;
        lastConfigKeyRef.current = configKey;
        setCanvas(offscreen);
    }, [
        canvas,
        layer.backgroundType,
        layer.backgroundColor,
        layer.atmosphereColor,
        layer.motifColor1,
        layer.motifColor2,
        layer.noiseSeed,
        layer.speedFactor,
        previewWidthBucket
    ]);

    if (!canvas) return null;

    return (
        <Image
            image={canvas}
            x={layer.config.cx}
            y={layer.config.cy}
            width={layer.config.width}
            height={layer.config.height}
            offsetX={layer.config.width / 2}
            offsetY={layer.config.height / 2}
            rotation={layer.config.rotation}
            scaleX={layer.config.scaleX}
            scaleY={layer.config.scaleY}
            listening={false}
        />
    );
}

export const KonvaBackgroundLayer = memo(
    KonvaBackgroundLayerInner,
    (prev, next) =>
        prev.previewScale === next.previewScale &&
        prev.layer.backgroundType === next.layer.backgroundType &&
        prev.layer.backgroundColor === next.layer.backgroundColor &&
        prev.layer.atmosphereColor === next.layer.atmosphereColor &&
        prev.layer.motifColor1 === next.layer.motifColor1 &&
        prev.layer.motifColor2 === next.layer.motifColor2 &&
        prev.layer.noiseSeed === next.layer.noiseSeed &&
        prev.layer.speedFactor === next.layer.speedFactor &&
        prev.layer.config.cx === next.layer.config.cx &&
        prev.layer.config.cy === next.layer.config.cy &&
        prev.layer.config.width === next.layer.config.width &&
        prev.layer.config.height === next.layer.config.height &&
        prev.layer.config.rotation === next.layer.config.rotation &&
        prev.layer.config.scaleX === next.layer.config.scaleX &&
        prev.layer.config.scaleY === next.layer.config.scaleY
);
