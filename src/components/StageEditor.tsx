import Konva from 'konva';
import { Eraser } from 'lucide-react';
import { ClassAttributes, DOMAttributes, FC, useEffect, useRef, useState } from 'react';
import { Stage, Layer, Rect, Line, Transformer, KonvaNodeEvents } from 'react-konva';

// import { useThrottledCallback } from '@tanstack/react-pacer';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Toggle } from '@/components/ui/toggle';

const DO_WIDTH = 3072;
const DO_HEIGHT = 432;

const getDOGridLines = () => {
    const lines = [];
    for (let i = 1; i < 16; i++)
        lines.push(
            <Line
                key={`v-${i}`}
                points={[(i * DO_WIDTH) / 16, 0, (i * DO_WIDTH) / 16, DO_HEIGHT]}
                strokeWidth={1}
                stroke="black"
            />
        );
    for (let i = 1; i < 5; i++)
        lines.push(
            <Line
                key={`h-${i}`}
                points={[0, (i * DO_HEIGHT) / 4, DO_WIDTH, (i * DO_HEIGHT) / 4]}
                strokeWidth={1}
                stroke="black"
            />
        );
    return lines;
};

const StageEditor = () => {
    const stageSlot = useRef<HTMLDivElement>(null);
    const [selectedId, selectShape] = useState<string | null>(null);
    const [tool, setTool] = useState('brush');
    const [drawnLines, setDrawnLines] = useState<Array<{ tool: string; points: Array<number> }>>(
        []
    );
    const lastX = useRef(0);
    const stageLastX = useRef(0);
    const isDrawing = useRef(false);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [showHighlight, setShowHighlight] = useState(true);
    const [showGrid, setShowGrid] = useState(true);
    const [showInk, setShowInk] = useState(true);
    const [shapes, setShapes] = useState(
        () =>
            Array.from({ length: 10 }, (_, i) => ({
                id: `${i}`,
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                height: Math.random() * 30 + 20,
                width: Math.random() * 30 + 20,
                rotation: 0,
                fill: getRandomColor()
            })) as Array<Partial<Konva.RectConfig>>
    );

    const checkDeselect = (e: Konva.KonvaEventObject<TouchEvent | MouseEvent>) => {
        // deselect when clicked on empty area
        const clickedOnEmpty = e.target === e.target.getStage();
        if (clickedOnEmpty) {
            selectShape(null);
        }
    };

    const handleDrawMouseStart: KonvaNodeEvents['onTouchStart'] = (e) => {
        if (e.evt.targetTouches && e.evt.targetTouches.length > 1) {
            lastX.current = e.evt.touches[0].clientX;
            if (stageSlot.current) {
                stageLastX.current = stageSlot.current.scrollLeft;
            }
            return;
        }
    };

    const handleDrawMouseMove: KonvaNodeEvents['onTouchMove'] = (e) => {
        if (e.evt.targetTouches && e.evt.targetTouches.length > 1) {
            const currentX = e.evt.touches[0].screenX;
            const deltaX = currentX - lastX.current;
            if (stageSlot.current) {
                stageSlot.current.scrollLeft = stageLastX.current - deltaX;
            }
            return;
        }

        if (!showInk) return;

        // prevent scrolling on touch devices
        e.evt.preventDefault();

        // no drawing - skipping
        if (!isDrawing.current) {
            isDrawing.current = true;
            const pos = e.target.getStage()?.getPointerPosition();
            if (pos) setDrawnLines([...drawnLines, { tool, points: [pos.x, pos.y] }]);
            return;
        }

        const stage = e.target.getStage();
        const point = stage?.getPointerPosition();
        if (!point) return;

        // To draw line
        let lastLine = drawnLines[drawnLines.length - 1] ?? {
            points: []
        };
        // add point
        lastLine.points = lastLine.points.concat([point.x, point.y]);

        // replace last
        drawnLines.splice(drawnLines.length - 1, 1, lastLine);
        setDrawnLines([...drawnLines]);
    };

    const handleDrawMouseUp = () => {
        isDrawing.current = false;
    };

    const handleDblClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
        const stage = e.target.getStage();
        if (!stage) return;
        const pos = stage.getPointerPosition();
        if (!pos) return;
        const newShape = {
            id: `${shapes.length}`,
            x: pos.x,
            y: pos.y,
            height: Math.random() * 30 + 20,
            width: Math.random() * 30 + 20,
            fill: getRandomColor()
        };
        setShapes([...shapes, newShape]);
    };

    const handleScroll: DOMAttributes<HTMLDivElement>['onScroll'] = (e) => {
        const scrollLeft = e.currentTarget.scrollLeft;
        setScrollLeft(scrollLeft);
    };

    const handleHorizontalDragMove: KonvaNodeEvents['onDragMove'] = (e) => {
        const x = e.target.x();
        if (x < 0) e.target.x(0);
        if (x > DO_WIDTH - e.target.width()) e.target.x(DO_WIDTH - e.target.width());
        if (stageSlot.current) {
            stageSlot.current.scrollLeft = x;
        }
        e.target.y(0);
    };

    const canvasWidth = stageSlot.current?.clientWidth || window.innerWidth;
    const canvasHeight = stageSlot.current?.clientHeight || window.innerHeight;

    return (
        <>
            <div
                ref={stageSlot}
                className="relative block touch-pan-x touch-pan-y overflow-auto overscroll-none"
                onScroll={handleScroll}
                onScrollEnd={handleScroll}
            >
                <Stage
                    width={DO_WIDTH}
                    height={DO_HEIGHT}
                    onDblClick={handleDblClick}
                    onMouseDown={checkDeselect}
                    onTouchStart={handleDrawMouseStart}
                    onTouchMove={handleDrawMouseMove}
                    onTouchEnd={handleDrawMouseUp}
                >
                    <Layer>
                        <Rect
                            x={0}
                            y={0}
                            width={DO_WIDTH}
                            height={DO_HEIGHT}
                            fill={showHighlight ? '#222' : '#000'}
                            listening={false}
                            onMouseDown={checkDeselect}
                            onTouchStart={checkDeselect}
                        />
                        {shapes.map((shape) => (
                            <Rectangle
                                key={shape.id}
                                {...shape}
                                shapeProps={shape}
                                isSelected={shape.id === selectedId}
                                onSelect={() => {
                                    selectShape(shape.id ?? null);
                                }}
                                onChange={(newAttrs) => {
                                    const shapesCopy = shapes.slice();
                                    const index = shapesCopy.findIndex((s) => s.id === shape.id);
                                    if (index !== -1) {
                                        shapesCopy[index] = newAttrs;
                                        setShapes(shapesCopy);
                                    }
                                }}
                                // onDragMove={(e) => handleDragMove(e, shape.id)}
                            />
                        ))}
                        {showInk &&
                            drawnLines.map((line, i) => (
                                <Line
                                    key={i}
                                    points={line.points}
                                    stroke="#df4b26"
                                    strokeWidth={5}
                                    tension={0.5}
                                    lineCap="round"
                                    lineJoin="round"
                                    globalCompositeOperation={
                                        line.tool === 'eraser' ? 'destination-out' : 'source-over'
                                    }
                                />
                            ))}
                        {showGrid && getDOGridLines()}
                    </Layer>
                </Stage>
            </div>
            <div className="overscroll-none">
                <Stage
                    width={DO_WIDTH / 10}
                    height={DO_HEIGHT / 10}
                    scaleX={1 / 10}
                    scaleY={1 / 10}
                    onClick={(e) => {
                        let x =
                            (e.target.getStage()?.getPointerPosition()?.x ?? 0) * 10 -
                            canvasWidth / 2;
                        if (x < 0) x = 0;
                        if (x > DO_WIDTH - canvasWidth) x = DO_WIDTH - canvasWidth;
                        setScrollLeft(x);
                    }}
                    className="inline-block cursor-pointer border bg-[#222]"
                >
                    <Layer>
                        {shapes.map((shape) => (
                            <Rect key={shape.id} {...shape} listening={false} />
                        ))}
                        <Rect
                            x={scrollLeft}
                            y={0}
                            width={canvasWidth}
                            height={canvasHeight}
                            fill="rgba(255, 255, 255, 0.2)"
                            draggable
                            onDragMove={handleHorizontalDragMove}
                        />
                        {showInk &&
                            drawnLines.map((line, i) => (
                                <Line
                                    key={i}
                                    points={line.points}
                                    stroke="#df4b26"
                                    strokeWidth={5}
                                    tension={0.5}
                                    lineCap="round"
                                    lineJoin="round"
                                    globalCompositeOperation={
                                        line.tool === 'eraser' ? 'destination-out' : 'source-over'
                                    }
                                />
                            ))}
                        {showGrid && getDOGridLines()}
                    </Layer>
                </Stage>
            </div>
            <div className="flex gap-4 p-4">
                <div className="flex items-center space-x-2">
                    <Switch id="show-grid" checked={showGrid} onCheckedChange={setShowGrid} />
                    <Label htmlFor="show-grid">Show Grid</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <Switch
                        id="show-highlight"
                        checked={showHighlight}
                        onCheckedChange={setShowHighlight}
                    />
                    <Label htmlFor="show-highlight">Highlight Background</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <Switch id="show-ink" checked={showInk} onCheckedChange={setShowInk} />
                    <Label htmlFor="show-ink">Show Ink</Label>
                </div>
            </div>
            <div className="flex gap-4 p-4">
                <div className="flex items-center space-x-2">
                    <Toggle
                        aria-label="Toggle eraser"
                        size="sm"
                        variant="outline"
                        onPressedChange={() => setTool(tool === 'eraser' ? 'pen' : 'eraser')}
                    >
                        <Eraser className="group-data-[state=on]/toggle:fill-foreground" />
                        Eraser
                    </Toggle>
                </div>
            </div>
        </>
    );
};

type RectangleNode<P = Konva.RectConfig> = FC<
    P & {
        shapeProps: Partial<P>;
        isSelected: boolean;
        onSelect: () => void;
        onChange: (newAttrs: Partial<P>) => void;
    } & KonvaNodeEvents &
        ClassAttributes<Konva.Rect>
>;

const Rectangle: RectangleNode = ({ shapeProps, isSelected, onSelect, onChange }) => {
    const shapeRef = useRef<Konva.Rect>(null);
    const trRef = useRef<Konva.Transformer>(null);

    // const handleResize = useThrottledCallback((newProps: any) => {
    //     shapeProps = {
    //         ...shapeProps, ...newProps
    //     }
    //     onChange(newProps);
    // }, {
    //     wait: 200 // Execute at most once every 100ms
    // });

    useEffect(() => {
        if (isSelected && shapeRef.current) {
            // we need to attach transformer manually
            trRef.current?.nodes([shapeRef.current]);
            trRef.current?.moveToTop();
        }
    }, [isSelected]);

    return (
        <>
            <Rect
                onClick={onSelect}
                onTap={onSelect}
                ref={shapeRef}
                {...shapeProps}
                draggable
                onDragMove={(e) => {
                    onChange({
                        ...shapeProps,
                        x: e.target.x(),
                        y: e.target.y()
                    });
                }}
                onTransform={() => {
                    const node = shapeRef.current;
                    if (!node) return;
                    onChange({
                        ...shapeProps,
                        x: node.x(),
                        y: node.y(),
                        scaleX: 1,
                        scaleY: 1,
                        rotation: node.rotation()
                    });
                }}
                onTransformEnd={() => {
                    // transformer is changing scale of the node
                    // and NOT its width or height
                    // but in the store we have only width and height
                    // to match the data better we will reset scale on transform end
                    const node = shapeRef.current;
                    if (!node) return;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();

                    // we will reset it back
                    node.scaleX(1);
                    node.scaleY(1);
                    onChange({
                        ...shapeProps,
                        x: node.x(),
                        y: node.y(),
                        rotation: node.rotation(),
                        // set minimal value
                        width: Math.max(5, node.width() * scaleX),
                        height: Math.max(node.height() * scaleY)
                    });
                }}
            />
            {isSelected && (
                <Transformer
                    ref={trRef}
                    flipEnabled={false}
                    boundBoxFunc={(oldBox, newBox) => {
                        // limit resize
                        if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5) {
                            return oldBox;
                        }
                        return newBox;
                    }}
                />
            )}
        </>
    );
};

const getRandomColor = () => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
};

export default StageEditor;
