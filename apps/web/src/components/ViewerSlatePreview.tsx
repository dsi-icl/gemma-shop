import Konva from 'konva';
import { useState, RefObject, useEffect } from 'react';
import { Circle, KonvaNodeEvents, Layer, Rect, Stage, Line } from 'react-konva';

import { PreviewMediaLayer, PreviewTextLayer } from '~/components/PreviewLayers';
import { getDOGridLines } from '~/lib/editorHelpers';
import type { LayerWithEditorState } from '~/lib/types';

type SlatePreviewProps = {
    stageSlot: RefObject<HTMLDivElement | null>;
    stageInstance: RefObject<Konva.Stage | null>;
    stageScaleFactor: number;
    layers: LayerWithEditorState[];
};

const PREVIEW_SCALE = 0.15;

export function ViewerSlatePreview({
    stageSlot,
    stageInstance,
    stageScaleFactor,
    layers
}: SlatePreviewProps) {
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

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    const canvasWidth = stageSlot.current?.clientWidth || viewportWidth;
    const canvasHeight = stageSlot.current?.clientHeight || viewportHeight;

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
                    {[...layers]
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
                                            fill="transparent"
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
                                            fill="transparent"
                                            stroke={shape.strokeColor}
                                            strokeWidth={shape.strokeWidth * stageScaleFactor * 4}
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
