import { useState, RefObject, useEffect } from 'react';
import { Circle, KonvaNodeEvents, Layer, Line, Rect, Stage } from 'react-konva';

import { getDOGridLines } from '~/lib/editorHelpers';
import { useEditorStore } from '~/lib/editorStore';

type SlatePreviewProps = {
    stageSlot: RefObject<HTMLDivElement | null>;
    stageWidth: number;
    stageHeight: number;
};

const scaleFactor = 10;

export function SlatePreview({ stageSlot, stageWidth, stageHeight }: SlatePreviewProps) {
    const [scrollLeft, setScrollLeft] = useState(0);
    const layers = useEditorStore((s) => s.layers);
    const showGrid = useEditorStore((s) => s.showGrid);
    const showInk = useEditorStore((s) => s.showInk);

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
                width={stageWidth / scaleFactor}
                height={stageHeight / scaleFactor}
                scaleX={1 / scaleFactor}
                scaleY={1 / scaleFactor}
                onClick={(e) => {
                    let x =
                        (e.target.getStage()?.getPointerPosition()?.x ?? 0) * scaleFactor -
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
                            if (showInk && shape.type === 'ink')
                                return (
                                    <Line
                                        key={`ink_${shape.numericId}`}
                                        points={shape.line.map((p) => p / scaleFactor)}
                                        stroke={shape.color}
                                        strokeWidth={(shape.width / scaleFactor) * 4}
                                        dash={shape.dash.map((d) => d / scaleFactor)}
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
                                            x={shape.config.cx / scaleFactor}
                                            y={shape.config.cy / scaleFactor}
                                            offsetX={shape.config.width / scaleFactor / 2}
                                            offsetY={shape.config.height / scaleFactor / 2}
                                            radius={shape.config.width / scaleFactor / 2}
                                            fill="transparent"
                                            stroke={shape.strokeColor}
                                            strokeWidth={(shape.strokeWidth / scaleFactor) * 4}
                                            dash={shape.strokeDash.map((d) => d / scaleFactor)}
                                            listening={false}
                                        />
                                    );
                                if (shape.shape === 'rectangle')
                                    return (
                                        <Rect
                                            key={shape.numericId}
                                            x={shape.config.cx / scaleFactor}
                                            y={shape.config.cy / scaleFactor}
                                            width={shape.config.width / scaleFactor}
                                            height={shape.config.height / scaleFactor}
                                            offsetX={shape.config.width / scaleFactor / 2}
                                            offsetY={shape.config.height / scaleFactor / 2}
                                            rotation={shape.config.rotation}
                                            fill="transparent"
                                            stroke={shape.strokeColor}
                                            strokeWidth={(shape.strokeWidth / scaleFactor) * 4}
                                            dash={shape.strokeDash.map((d) => d / scaleFactor)}
                                            listening={false}
                                        />
                                    );
                            }
                            return (
                                <Rect
                                    key={shape.numericId}
                                    x={shape.config.cx / scaleFactor}
                                    y={shape.config.cy / scaleFactor}
                                    width={shape.config.width / scaleFactor}
                                    height={shape.config.height / scaleFactor}
                                    offsetX={shape.config.width / scaleFactor / 2}
                                    offsetY={shape.config.height / scaleFactor / 2}
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
