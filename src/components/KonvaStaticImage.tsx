'use client';

import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useRef, useState } from 'react';
import { Image } from 'react-konva';

import type { LayerWithEditorState } from '@/lib/types';

export function KonvaStaticImage({
    layer,
    isPinching,
    onSelect,
    onTransform,
    onTransformEnd
}: {
    layer: Extract<LayerWithEditorState, { type: 'image' }>;
    isPinching: boolean;
    onSelect: () => void;
    onTransform: (e: KonvaEventObject<Event>) => void;
    onTransformEnd: (e: KonvaEventObject<Event>) => void;
}) {
    const [img, setImg] = useState<HTMLImageElement | null>(null);
    const imageRef = useRef<Konva.Image>(null);

    useEffect(() => {
        if (layer.type !== 'image')
            return () => {
                setImg(null);
            };
        const i = new window.Image();
        if (!layer.url.startsWith('blob:') && !layer.url.startsWith('data:')) {
            i.crossOrigin = 'anonymous';
        }
        i.onload = () => {
            setImg(i);
            imageRef.current?.getLayer()?.batchDraw();
        };
        i.src = layer.url;
    }, [`${layer.type === 'image' ? layer.url : ''}`]);

    return (
        <Image
            id={layer.numericId.toString()}
            ref={imageRef}
            image={img || undefined}
            x={layer.config.cx}
            y={layer.config.cy}
            width={layer.config.width}
            height={layer.config.height}
            scaleX={layer.config.scaleX}
            scaleY={layer.config.scaleY}
            offsetX={layer.config.width / 2}
            offsetY={layer.config.height / 2}
            rotation={layer.config.rotation}
            draggable={!isPinching}
            onClick={onSelect}
            onTap={onSelect}
            onDragMove={onTransform}
            onTransform={onTransform}
            onDragEnd={onTransformEnd}
            onTransformEnd={onTransformEnd}
        />
    );
}
