'use client';

import { EraserIcon } from '@phosphor-icons/react';
import { useLiveQuery } from '@tanstack/react-db';
import { useThrottledCallback } from '@tanstack/react-pacer';
import Konva from 'konva';
import {
    ClassAttributes,
    DOMAttributes,
    FC,
    useCallback,
    useEffect,
    useRef,
    useState
} from 'react';
import { Stage, Layer, Rect, Line, Transformer, KonvaNodeEvents } from 'react-konva';

// import { useThrottledCallback } from '@tanstack/react-pacer';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Toggle } from '@/components/ui/toggle';
import { inkCollection } from '@/db/inkCollection';
import { shapesCollection } from '@/db/shapesCollection';
import { addRectangleShape, updateShape } from '@/lib/stageTools';

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
    const [renderStateCounter, setRenderStateCounter] = useState(0);
    const { data: shapes, collection: sCol } = useLiveQuery((q) =>
        q.from({ shapes: shapesCollection })
    );
    const { data: inks, collection: iCol } = useLiveQuery((q) => q.from({ inks: inkCollection }));
    const stageSlot = useRef<HTMLDivElement>(null);
    const [tool, setTool] = useState('brush');
    const lastX = useRef(0);
    const stageLastX = useRef(0);
    const isDrawing = useRef(false);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [showHighlight, setShowHighlight] = useState(true);
    const [showGrid, setShowGrid] = useState(true);
    const [showInk, setShowInk] = useState(true);
    const selectedId = shapes?.find((s) => s.selected)?.id ?? null;

    useEffect(() => {
        const sSub = sCol.subscribeChanges(() => {
            setRenderStateCounter((c) => c + 1);
        });
        const iSub = iCol.subscribeChanges(() => {
            setRenderStateCounter((c) => c + 1);
        });
        return () => {
            sSub.unsubscribe();
            iSub.unsubscribe();
        };
    }, []);

    const addInk = (line: Omit<(typeof inks)[number], 'id'>) => {
        inkCollection.insert({
            id: `l-${Date.now()}`,
            ...line
        });
    };
    const updateInk = useThrottledCallback(
        (line: (typeof inks)[number]) => {
            console.log('UPDATING...');
            inkCollection.update(line.id, (attrs) => {
                line.points = new Array(...attrs.points);
                line.iteration = Math.random();
            });
            // TO-DO: Not good to update the whole line on every point change, need to optimize this
            setRenderStateCounter((c) => c + 1);
        },
        {
            wait: 100
        }
    );

    const checkDeselect = (e: Konva.KonvaEventObject<TouchEvent | MouseEvent>) => {
        const clickedOnEmpty = e.target === e.target.getStage();
        if (clickedOnEmpty && selectedId) {
            shapesCollection.update(selectedId, (attrs) => {
                attrs.selected = false;
            });
        }
    };

    const selectShape = (id: string) => {
        const alreadySelectedShapeId = shapes?.find((s) => s.selected)?.id;
        shapesCollection.update([alreadySelectedShapeId, id].filter(Boolean), (attrs) => {
            attrs.forEach((attr) => {
                if (attr.id === alreadySelectedShapeId) attr.selected = false;
                else if (attr.id === id) attr.selected = true;
            });
        });
    };

    const handleDrawTouchStart: KonvaNodeEvents['onTouchStart'] = (e) => {
        if (e.evt.targetTouches && e.evt.targetTouches.length > 1) {
            lastX.current = e.evt.touches[0].clientX;
            if (stageSlot.current) {
                stageLastX.current = stageSlot.current.scrollLeft;
            }
            return;
        }
    };

    const handleDrawTouchMove: KonvaNodeEvents['onTouchMove'] = (e) => {
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
            if (pos) addInk({ tool, points: [pos.x, pos.y] });
            return;
        }

        const stage = e.target.getStage();
        const point = stage?.getPointerPosition();
        if (!point) return;

        // To draw line
        let lastLine = inks[inks.length - 1] ?? {
            points: []
        };
        // add point
        lastLine.points = lastLine.points.concat([point.x, point.y]);

        // replace last
        updateInk(lastLine);
        setRenderStateCounter((c) => c + 1);
    };

    const handleDrawTouchUp = () => {
        isDrawing.current = false;
        inkCollection.createIndex((doc) => doc.points);
    };

    const handleDblClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
        const stage = e.target.getStage();
        if (!stage) return;
        const pos = stage.getPointerPosition();
        if (!pos) return;

        addRectangleShape({
            x: pos.x - 50,
            y: pos.y - 50,
            width: 100,
            height: 100
        });
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
                id="main-stage-editor-slot"
                className="relative block touch-pan-x touch-pan-y overflow-auto overscroll-none"
                onScroll={handleScroll}
                onScrollEnd={handleScroll}
            >
                <Stage
                    width={DO_WIDTH}
                    height={DO_HEIGHT}
                    onDblClick={handleDblClick}
                    onMouseDown={checkDeselect}
                    onTouchStart={handleDrawTouchStart}
                    onTouchMove={handleDrawTouchMove}
                    onTouchEnd={handleDrawTouchUp}
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
                        {shapes
                            .sort((a, b) => a.order - b.order)
                            .map((shape) =>
                                shape.visible ? (
                                    shape.type === 'rect' ? (
                                        <Rectangle
                                            key={shape.id}
                                            {...shape}
                                            shapeProps={shape}
                                            // isSelected={shape.selected}
                                            onSelect={() => {
                                                selectShape(shape.id);
                                            }}
                                            onChange={(newAttrs) => {
                                                updateShape({
                                                    ...shape,
                                                    x: Math.round(newAttrs.x ?? shape.x),
                                                    y: Math.round(newAttrs.y ?? shape.y),
                                                    rotation: Math.round(
                                                        newAttrs.rotation ?? shape.rotation
                                                    ),
                                                    width: Math.round(
                                                        newAttrs.width ?? shape.width
                                                    ),
                                                    height: Math.round(
                                                        newAttrs.height ?? shape.height
                                                    ),
                                                    fill: newAttrs.fill?.toString() ?? shape.fill
                                                });
                                                // const shapesCopy = shapes.slice();
                                                // const index = shapesCopy.findIndex((s) => s.id === shape.id);
                                                // if (index !== -1) {
                                                //     shapesCopy[index] = newAttrs;
                                                //     setShapes(shapesCopy);
                                                // }
                                            }}
                                            // onDragMove={(e) => handleDragMove(e, shape.id)}
                                        />
                                    ) : null
                                ) : null
                            )}
                        {showInk &&
                            inks.map((line, i) => (
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
                            inks.map((line, i) => (
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
                        <EraserIcon
                            weight={tool === 'eraser' ? 'fill' : 'regular'}
                            className="group-data-[state=on]/toggle:fill-foreground"
                        />
                        Eraser
                    </Toggle>
                </div>
            </div>
        </>
    );
};

type RectangleNode<P = Konva.RectConfig> = FC<
    P & {
        shapeProps: Partial<P & ReturnType<(typeof shapesCollection)['get']>>;
        // isSelected: boolean;
        onSelect: () => void;
        onChange: (newAttrs: Partial<P>) => void;
    } & KonvaNodeEvents &
        ClassAttributes<Konva.Rect>
>;

const Rectangle: RectangleNode = ({ shapeProps, onSelect, onChange }) => {
    const shapeRef = useRef<Konva.Rect>(null);
    const trRef = useRef<Konva.Transformer>(null);
    const [shadowShape, setShadowShape] = useState(shapeProps);
    const [shouldCenterTransform, setShouldCenterTransform] = useState(false);
    const [shouldMaintainAspectRatio, setShouldMaintainAspectRatio] = useState(false);

    // const handleResize = useThrottledCallback((newProps: any) => {
    //     shapeProps = {
    //         ...shapeProps, ...newProps
    //     }
    //     onChange(newProps);
    // }, {
    //     wait: 200 // Execute at most once every 100ms
    // });

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Delete' && shapeProps.id && shapeProps.selected) {
                shapesCollection.delete(shapeProps.id);
            }
            if (!shouldCenterTransform && e.ctrlKey) setShouldCenterTransform(true);
            if (!shouldMaintainAspectRatio && e.shiftKey) setShouldMaintainAspectRatio(true);
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (shouldCenterTransform) {
                onChange({
                    ...shapeProps,
                    x: shadowShape.x,
                    y: shadowShape.y
                });
                setShouldCenterTransform(false);
            }
            if (shouldMaintainAspectRatio) setShouldMaintainAspectRatio(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [
        shapeProps,
        setShouldCenterTransform,
        setShouldMaintainAspectRatio,
        shouldCenterTransform,
        shouldMaintainAspectRatio
    ]);

    useEffect(() => {
        if (shapeProps.selected && shapeRef.current) {
            // we need to attach transformer manually
            trRef.current?.nodes([shapeRef.current]);
            trRef.current?.moveToTop();
        }
    }, [shapeProps.selected]);

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
                    const newShapeData = {
                        ...shapeProps,
                        x: node.x(),
                        y: node.y(),
                        rotation: node.rotation(),
                        // set minimal value
                        width: Math.max(5, node.width() * scaleX),
                        height: Math.max(node.height() * scaleY)
                    };
                    onChange(newShapeData);
                    setShadowShape(newShapeData);
                }}
            />
            {shapeProps.selected && (
                <Transformer
                    ref={trRef}
                    flipEnabled={false}
                    keepRatio={shouldMaintainAspectRatio}
                    centeredScaling={shouldCenterTransform}
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

export default StageEditor;
