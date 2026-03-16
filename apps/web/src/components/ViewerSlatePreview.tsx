import { decode, isBlurhashValid } from 'blurhash';
import { useState, RefObject, useEffect } from 'react';
import { Konva, Circle, KonvaNodeEvents, Layer, Rect, Stage, Image, Line } from 'react-konva';

import { getDOGridLines } from '~/lib/editorHelpers';
import type { LayerWithEditorState } from '~/lib/types';

type SlatePreviewProps = {
    stageSlot: RefObject<HTMLDivElement | null>;
    stageInstance: RefObject<Konva.Stage | null>;
    layers: LayerWithEditorState[];
};

const PREVIEW_SCALE = 0.2;

export function ViewerSlatePreview({ stageSlot, stageInstance, layers }: SlatePreviewProps) {
    const [scrollLeft, setScrollLeft] = useState(0);
    const [showGrid] = useState(true);

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
        if (stageSlot.current) {
            stageSlot.current.scrollLeft = x;
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
                    {[...layers]
                        .sort((a, b) => a.config.zIndex - b.config.zIndex)
                        .map((shape) => {
                            if (shape.type === 'ink')
                                return (
                                    <Line
                                        key={`ink_${shape.numericId}`}
                                        points={shape.line.map((p) => p * PREVIEW_SCALE)}
                                        stroke={shape.color}
                                        strokeWidth={shape.width * PREVIEW_SCALE * 4}
                                        dash={shape.dash.map((d) => d * PREVIEW_SCALE)}
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
                                            x={shape.config.cx * PREVIEW_SCALE}
                                            y={shape.config.cy * PREVIEW_SCALE}
                                            offsetX={(shape.config.width * PREVIEW_SCALE) / 2}
                                            offsetY={(shape.config.height * PREVIEW_SCALE) / 2}
                                            radius={(shape.config.width * PREVIEW_SCALE) / 2}
                                            fill="transparent"
                                            stroke={shape.strokeColor}
                                            strokeWidth={shape.strokeWidth * PREVIEW_SCALE * 4}
                                            dash={shape.strokeDash.map((d) => d * PREVIEW_SCALE)}
                                            listening={false}
                                        />
                                    );
                                if (shape.shape === 'rectangle')
                                    return (
                                        <Rect
                                            key={shape.numericId}
                                            x={shape.config.cx * PREVIEW_SCALE}
                                            y={shape.config.cy * PREVIEW_SCALE}
                                            width={shape.config.width * PREVIEW_SCALE}
                                            height={shape.config.height * PREVIEW_SCALE}
                                            offsetX={(shape.config.width * PREVIEW_SCALE) / 2}
                                            offsetY={(shape.config.height * PREVIEW_SCALE) / 2}
                                            rotation={shape.config.rotation}
                                            fill="transparent"
                                            stroke={shape.strokeColor}
                                            strokeWidth={shape.strokeWidth * PREVIEW_SCALE * 4}
                                            dash={shape.strokeDash.map((d) => d * PREVIEW_SCALE)}
                                            listening={false}
                                        />
                                    );
                            }
                            if (
                                shape.type === 'image' &&
                                shape.blurhash &&
                                isBlurhashValid(shape.blurhash)
                            ) {
                                const pixels = decode(
                                    shape.blurhash,
                                    100,
                                    100
                                ) as Uint8ClampedArray<ArrayBuffer>;
                                const imageData = new ImageData(pixels, 100, 100);
                                const offscreenCanvas = document.createElement('canvas');
                                offscreenCanvas.width = 100;
                                offscreenCanvas.height = 100;
                                const ctx = offscreenCanvas.getContext('2d');
                                ctx?.putImageData(imageData, 0, 0);
                                return (
                                    <Image
                                        key={shape.numericId}
                                        image={offscreenCanvas}
                                        x={shape.config.cx * PREVIEW_SCALE}
                                        y={shape.config.cy * PREVIEW_SCALE}
                                        width={shape.config.width * PREVIEW_SCALE}
                                        height={shape.config.height * PREVIEW_SCALE}
                                        offsetX={(shape.config.width * PREVIEW_SCALE) / 2}
                                        offsetY={(shape.config.height * PREVIEW_SCALE) / 2}
                                        rotation={shape.config.rotation}
                                        listening={false}
                                    />
                                );
                            }
                            return (
                                <Rect
                                    key={shape.numericId}
                                    x={shape.config.cx * PREVIEW_SCALE}
                                    y={shape.config.cy * PREVIEW_SCALE}
                                    width={shape.config.width * PREVIEW_SCALE}
                                    height={shape.config.height * PREVIEW_SCALE}
                                    offsetX={(shape.config.width * PREVIEW_SCALE) / 2}
                                    offsetY={(shape.config.height * PREVIEW_SCALE) / 2}
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
