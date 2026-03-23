'use client';

import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useRef } from 'react';
import { Image } from 'react-konva';

import type { LayerWithEditorState } from '~/lib/types';

export function RoyStaticRenderer({
    layer,
    isDrawing,
    isPinching,
    opacity,
    onSelect,
    onTransform,
    onTransformEnd
}: {
    layer: LayerWithEditorState;
    isDrawing: boolean;
    isPinching: boolean;
    opacity?: number;
    onSelect: (e: KonvaEventObject<MouseEvent | TouchEvent>) => void;
    onTransform: (e: KonvaEventObject<Event>) => void;
    onTransformEnd: (e: KonvaEventObject<Event>) => void;
}) {
    const imageRef = useRef<Konva.Image>(null);
    useEffect(() => {
        const updateTimer = setInterval(() => {
            const royElement = document.getElementById('roy-force-graph-host') as HTMLCanvasElement;
            const url = royElement.toDataURL();
            royElement.style.height = `${layer.config.height}px`;
            royElement.style.width = `${layer.config.width}px`;
            royElement.style.offset = `${layer.config.height / 2 + 'px'}, ${layer.config.width / 2 + 'px'}`;
            if (imageRef.current) {
                const img = new window.Image(layer.config.width, layer.config.height);
                img.src = url;
                imageRef.current.image(img);
                imageRef.current.draw();
            }
        }, 100);
        return () => clearInterval(updateTimer);
    }, []);

    return (
        <Image
            id={layer.numericId.toString()}
            ref={imageRef}
            image={undefined}
            width={layer.config.width}
            height={layer.config.height}
            offsetX={layer.config.width / 2}
            offsetY={layer.config.height / 2}
            x={layer.config.cx}
            y={layer.config.cy}
            scaleX={layer.config.scaleX}
            scaleY={layer.config.scaleY}
            rotation={layer.config.rotation}
            opacity={opacity}
            listening={!isDrawing}
            draggable={!isDrawing && !isPinching}
            onClick={onSelect}
            onTap={onSelect}
            onDragMove={onTransform}
            onTransform={onTransform}
            onDragEnd={onTransformEnd}
            onTransformEnd={onTransformEnd}
        />
    );
}
