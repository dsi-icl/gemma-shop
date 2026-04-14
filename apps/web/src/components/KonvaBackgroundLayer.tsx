import { useEffect, useState } from 'react';
import { Image } from 'react-konva';

import { BACKGROUND_T_SPEED, renderBackgroundNoise } from '~/lib/backgroundNoise';
import { COLS, ROWS } from '~/lib/stageConstants';
import type { Layer } from '~/lib/types';

// Canvas sized to wall aspect ratio (COLS:ROWS = 16:4) for accurate noise preview.
// Width chosen to give reasonable resolution without excess pixel cost.
const KONVA_PREVIEW_W = 320;
const KONVA_PREVIEW_H = Math.round((KONVA_PREVIEW_W * ROWS) / COLS); // 80px

type BackgroundLayer = Extract<Layer, { type: 'background' }>;

interface KonvaBackgroundLayerProps {
    layer: BackgroundLayer;
}

/**
 * Static noise snapshot rendered as a Konva Image covering the full wall.
 * Non-interactive — click/drag pass through to layers below.
 */
export function KonvaBackgroundLayer({ layer }: KonvaBackgroundLayerProps) {
    const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const offscreen = document.createElement('canvas');
        offscreen.width = KONVA_PREVIEW_W;
        offscreen.height = KONVA_PREVIEW_H;
        // Use current wall-clock t (same formula as WallBackgroundCanvas) so
        // the preview matches what the wall is showing right now.
        const t = (Date.now() / 1000) * BACKGROUND_T_SPEED * layer.speedFactor;
        renderBackgroundNoise(offscreen, layer, 0, 0, t, COLS, ROWS);
        setCanvas(offscreen);
    }, [
        layer.backgroundColor,
        layer.atmosphereColor,
        layer.motifColor1,
        layer.motifColor2,
        layer.noiseSeed,
        layer.speedFactor
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
