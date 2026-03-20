import { decode, isBlurhashValid } from 'blurhash';
import Konva from 'konva';
import { useState, RefObject, useEffect } from 'react';
import { Circle, KonvaNodeEvents, Layer, Line, Rect, Stage, Image } from 'react-konva';

import { getDOGridLines } from '~/lib/editorHelpers';
import { useEditorStore } from '~/lib/editorStore';
import { textHtmlToImage } from '~/lib/textToCanvas';
import type { LayerWithEditorState } from '~/lib/types';

type SlatePreviewProps = {
    stageSlot: RefObject<HTMLDivElement | null>;
    stageInstance: RefObject<Konva.Stage | null>;
    stageScaleFactor: number;
};

const PREVIEW_SCALE = 0.15;

function deriveVideoStillImageFilename(url: string): string | null {
    if (!url.startsWith('/api/assets/')) return null;
    const filename = url.split('/').pop() ?? '';
    const base = filename.replace(/\.[^.]+$/, '');
    return base ? `${base}_preview.jpg` : null;
}

function PreviewMediaLayer({
    shape,
    stageScaleFactor
}: {
    shape: Extract<LayerWithEditorState, { type: 'image' | 'video' | 'web' }>;
    stageScaleFactor: number;
}) {
    const [img, setImg] = useState<HTMLImageElement | null>(null);

    const mediaUrl =
        shape.type === 'image'
            ? shape.url
            : shape.type === 'video'
              ? shape.stillImage
                  ? `/api/assets/${shape.stillImage}`
                  : (() => {
                        const fallbackStill = deriveVideoStillImageFilename(shape.url);
                        return fallbackStill ? `/api/assets/${fallbackStill}` : null;
                    })()
              : shape.stillImage
                ? `/api/assets/${shape.stillImage}`
                : null;

    useEffect(() => {
        if (!mediaUrl) return;
        const i = new window.Image();
        if (!mediaUrl.startsWith('blob:') && !mediaUrl.startsWith('data:')) {
            i.crossOrigin = 'anonymous';
        }
        i.onload = () => setImg(i);
        i.onerror = () => setImg(null);
        i.src = mediaUrl;
    }, [mediaUrl]);

    if (mediaUrl && img) {
        return (
            <Image
                image={img}
                x={shape.config.cx * stageScaleFactor}
                y={shape.config.cy * stageScaleFactor}
                width={shape.config.width * stageScaleFactor}
                height={shape.config.height * stageScaleFactor}
                offsetX={(shape.config.width * stageScaleFactor) / 2}
                offsetY={(shape.config.height * stageScaleFactor) / 2}
                rotation={shape.config.rotation}
                listening={false}
            />
        );
    }

    if (shape.blurhash && isBlurhashValid(shape.blurhash)) {
        const pixels = decode(shape.blurhash, 100, 100) as Uint8ClampedArray<ArrayBuffer>;
        const imageData = new ImageData(pixels, 100, 100);
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = 100;
        offscreenCanvas.height = 100;
        const ctx = offscreenCanvas.getContext('2d');
        ctx?.putImageData(imageData, 0, 0);
        return (
            <Image
                image={offscreenCanvas}
                x={shape.config.cx * stageScaleFactor}
                y={shape.config.cy * stageScaleFactor}
                width={shape.config.width * stageScaleFactor}
                height={shape.config.height * stageScaleFactor}
                offsetX={(shape.config.width * stageScaleFactor) / 2}
                offsetY={(shape.config.height * stageScaleFactor) / 2}
                rotation={shape.config.rotation}
                listening={false}
            />
        );
    }

    return (
        <Rect
            x={shape.config.cx * stageScaleFactor}
            y={shape.config.cy * stageScaleFactor}
            width={shape.config.width * stageScaleFactor}
            height={shape.config.height * stageScaleFactor}
            offsetX={(shape.config.width * stageScaleFactor) / 2}
            offsetY={(shape.config.height * stageScaleFactor) / 2}
            rotation={shape.config.rotation}
            fill="#555"
            listening={false}
        />
    );
}

function PreviewTextLayer({
    shape,
    stageScaleFactor
}: {
    shape: Extract<LayerWithEditorState, { type: 'text' }>;
    stageScaleFactor: number;
}) {
    const [img, setImg] = useState<HTMLImageElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        textHtmlToImage(shape.textHtml ?? '', shape.config.width, shape.config.height)
            .then((rendered) => {
                if (!cancelled) setImg(rendered);
            })
            .catch(() => {
                if (!cancelled) setImg(null);
            });
        return () => {
            cancelled = true;
        };
    }, [shape.textHtml, shape.config.width, shape.config.height]);

    if (img) {
        return (
            <Image
                image={img}
                x={shape.config.cx * stageScaleFactor}
                y={shape.config.cy * stageScaleFactor}
                width={shape.config.width * stageScaleFactor}
                height={shape.config.height * stageScaleFactor}
                offsetX={(shape.config.width * stageScaleFactor) / 2}
                offsetY={(shape.config.height * stageScaleFactor) / 2}
                rotation={shape.config.rotation}
                listening={false}
            />
        );
    }

    return (
        <Rect
            x={shape.config.cx * stageScaleFactor}
            y={shape.config.cy * stageScaleFactor}
            width={shape.config.width * stageScaleFactor}
            height={shape.config.height * stageScaleFactor}
            offsetX={(shape.config.width * stageScaleFactor) / 2}
            offsetY={(shape.config.height * stageScaleFactor) / 2}
            rotation={shape.config.rotation}
            fill="#555"
            listening={false}
        />
    );
}

export function SlatePreview({ stageSlot, stageInstance, stageScaleFactor }: SlatePreviewProps) {
    const [scrollLeft, setScrollLeft] = useState(0);
    const layers = useEditorStore((s) => s.layers);
    const showGrid = useEditorStore((s) => s.showGrid);

    const stageWidth = stageInstance.current?.width() || 0;
    const stageHeight = stageInstance.current?.height() || 0;

    useEffect(() => {
        if (!stageSlot.current) return;
        const currentStageSlot = stageSlot.current;
        const onScroll = () => {
            if (!stageSlot.current) return;
            setScrollLeft(stageSlot.current.scrollLeft);
        };
        stageSlot.current.addEventListener('scroll', onScroll);
        return () => {
            currentStageSlot?.removeEventListener('scroll', onScroll);
        };
    }, [stageSlot]);

    const canvasWidth = stageSlot.current?.clientWidth || window.innerWidth;
    const canvasHeight = stageSlot.current?.clientHeight || window.innerHeight;

    const handleHorizontalDragMove: KonvaNodeEvents['onDragMove'] = (e) => {
        const x = e.target.x();
        if (x < 0) e.target.x(0);
        if (x > stageWidth - e.target.width()) e.target.x(stageWidth - e.target.width());
        const slot = stageSlot.current;
        if (slot) {
            // oxlint-disable-next-line react-hooks-js/immutability
            slot.scrollLeft = x;
        }
        e.target.y(0);
    };

    return (
        <div className="lineheig m-0 line-clamp-1 block overscroll-none p-0 text-center">
            <Stage
                width={stageWidth * PREVIEW_SCALE}
                height={stageHeight * PREVIEW_SCALE}
                scaleX={PREVIEW_SCALE}
                scaleY={PREVIEW_SCALE}
                onClick={(e) => {
                    let x =
                        (e.target.getStage()?.getPointerPosition()?.x ?? 0) * PREVIEW_SCALE -
                        canvasWidth / 2;
                    if (x < 0) x = 0;
                    if (x > stageWidth - canvasWidth) x = stageWidth - canvasWidth;
                    setScrollLeft(x);
                }}
                className="m-auto block w-fit cursor-pointer bg-[#222]"
            >
                <Layer>
                    {Array.from(layers.values())
                        .sort((a, b) => a.config.zIndex - b.config.zIndex)
                        .filter((shape) => shape.config.visible)
                        .map((shape) => {
                            if (shape.type === 'line')
                                return (
                                    <Line
                                        key={`lin_${shape.numericId}`}
                                        points={shape.line.map((p) => p * stageScaleFactor)}
                                        stroke={shape.strokeColor}
                                        strokeWidth={shape.strokeWidth * stageScaleFactor * 4}
                                        dash={shape.strokeDash.map((d) => d * stageScaleFactor)}
                                        dashEnabled={true}
                                        tension={0.4}
                                        lineCap="round"
                                        lineJoin="round"
                                    />
                                );
                            if (shape.type === 'shape') {
                                if (shape.shape === 'circle')
                                    return (
                                        <Circle
                                            key={shape.numericId}
                                            x={shape.config.cx * stageScaleFactor}
                                            y={shape.config.cy * stageScaleFactor}
                                            offsetX={(shape.config.width * stageScaleFactor) / 2}
                                            offsetY={(shape.config.height * stageScaleFactor) / 2}
                                            radius={(shape.config.width * stageScaleFactor) / 2}
                                            fill={shape.fill}
                                            stroke={shape.strokeColor}
                                            strokeWidth={shape.strokeWidth * stageScaleFactor * 4}
                                            dash={shape.strokeDash.map((d) => d * stageScaleFactor)}
                                            lineCap="round"
                                            lineJoin="round"
                                            listening={false}
                                        />
                                    );
                                if (shape.shape === 'rectangle')
                                    return (
                                        <Rect
                                            key={shape.numericId}
                                            x={shape.config.cx * stageScaleFactor}
                                            y={shape.config.cy * stageScaleFactor}
                                            width={shape.config.width * stageScaleFactor}
                                            height={shape.config.height * stageScaleFactor}
                                            offsetX={(shape.config.width * stageScaleFactor) / 2}
                                            offsetY={(shape.config.height * stageScaleFactor) / 2}
                                            rotation={shape.config.rotation}
                                            fill={shape.fill}
                                            stroke={shape.strokeColor}
                                            strokeWidth={shape.strokeWidth * stageScaleFactor * 2}
                                            dash={shape.strokeDash.map((d) => d * stageScaleFactor)}
                                            dashOffset={
                                                ((shape.strokeDash[0] ?? 0) * stageScaleFactor) / 2
                                            }
                                            lineCap="round"
                                            lineJoin="round"
                                            listening={false}
                                        />
                                    );
                            }
                            if (
                                shape.type === 'image' ||
                                shape.type === 'video' ||
                                shape.type === 'web'
                            ) {
                                return (
                                    <PreviewMediaLayer
                                        key={shape.numericId}
                                        shape={shape}
                                        stageScaleFactor={stageScaleFactor}
                                    />
                                );
                            }
                            if (shape.type === 'text') {
                                return (
                                    <PreviewTextLayer
                                        key={shape.numericId}
                                        shape={shape}
                                        stageScaleFactor={stageScaleFactor}
                                    />
                                );
                            }
                            return (
                                <Rect
                                    key={shape.numericId}
                                    x={shape.config.cx * stageScaleFactor}
                                    y={shape.config.cy * stageScaleFactor}
                                    width={shape.config.width * stageScaleFactor}
                                    height={shape.config.height * stageScaleFactor}
                                    offsetX={(shape.config.width * stageScaleFactor) / 2}
                                    offsetY={(shape.config.height * stageScaleFactor) / 2}
                                    rotation={shape.config.rotation}
                                    fill="#555"
                                    listening={false}
                                />
                            );
                        })}
                    <Rect
                        x={scrollLeft}
                        y={0}
                        width={canvasWidth}
                        height={canvasHeight}
                        fill="rgba(255, 255, 255, 0.2)"
                        draggable
                        onDragMove={handleHorizontalDragMove}
                    />
                    {showGrid && getDOGridLines(stageWidth, stageHeight)}
                </Layer>
            </Stage>
        </div>
    );
}
