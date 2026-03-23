import { CircleNotchIcon, SlideshowIcon } from '@phosphor-icons/react';
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup
} from '@repo/ui/components/resizable';
import { cn } from '@repo/ui/lib/utils';
import { createFileRoute, useLocation } from '@tanstack/react-router';
import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import {
    startTransition,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import { Stage, Layer as KonvaLayer, Rect, Circle, Line } from 'react-konva';
import { useShallow } from 'zustand/react/shallow';

import { ControllerToolbar } from '~/components/ControllerToolbar';
import { ReadOnlyMediaLayer, ReadOnlyTextLayer } from '~/components/ReadOnlyLayers';
import { ViewerSlatePreview } from '~/components/ViewerSlatePreview';
import { ControllerEngine } from '~/lib/controllerEngine';
import { useControllerStore } from '~/lib/controllerStore';
import type { LayerWithEditorState } from '~/lib/types';
import { $getCommit } from '~/server/projects.fns';

const DEFAULT_STAGE_SCALE_FACTOR = 0.15;
const SCREEN_W = 1920;
const SCREEN_H = 1080;
const COLS = 16;
const ROWS = 4;

export const Route = createFileRoute('/controller/')({
    component: Controller
});

interface BindingStatus {
    bound: boolean;
    projectId?: string;
    commitId?: string;
    slideId?: string;
}

interface SlideEntry {
    id: string;
    name: string;
    order: number;
    layers: LayerWithEditorState[];
    layerCount: number;
}

function buildLineLayer(
    line: number[],
    strokeColor: string,
    strokeWidth: number,
    strokeDash: number[],
    existingLayers: LayerWithEditorState[]
): LayerWithEditorState | null {
    let minX: number | null = null;
    let minY: number | null = null;
    let maxX: number | null = null;
    let maxY: number | null = null;

    for (let i = 0; i < line.length; i += 2) {
        const x = line[i];
        const y = line[i + 1];
        if (minX === null || minY === null || maxX === null || maxY === null) {
            minX = x;
            minY = y;
            maxX = x;
            maxY = y;
        }
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }

    if (minX === null || minY === null || maxX === null || maxY === null) return null;

    const nextNumericId =
        existingLayers.reduce((max, layer) => Math.max(max, layer.numericId), 0) + 5;
    const nextZIndex =
        existingLayers.reduce((max, layer) => Math.max(max, layer.config.zIndex), 0) + 5;

    return {
        numericId: nextNumericId,
        type: 'line',
        config: {
            cx: minX,
            cy: minY,
            width: Math.round(maxX - minX),
            height: Math.round(maxY - minY),
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            zIndex: nextZIndex,
            visible: true
        },
        line: line.map((p) => Math.round(p)),
        strokeColor,
        strokeWidth,
        strokeDash
    };
}

function Controller() {
    const stageSlot = useRef<HTMLDivElement>(null);
    const stageInstance = useRef<Konva.Stage>(null);
    const [stageScaleFactor, setStageScaleFactor] = useState(DEFAULT_STAGE_SCALE_FACTOR);
    const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
    const [requestedSlideId, setRequestedSlideId] = useState<string | null>(null);
    const searchStr = useLocation({
        select: (location) => location.searchStr
    });
    const { wallId, mountLocation } = useMemo(() => {
        const params = new URLSearchParams(searchStr);
        return { wallId: params.get('w'), mountLocation: params.get('l') };
    }, [searchStr]);

    const showHideHeadAndFoot = mountLocation === 'gallery';

    const engine = useMemo(() => (wallId ? ControllerEngine.getInstance(wallId) : null), [wallId]);
    const [binding, setBinding] = useState<BindingStatus>({ bound: false });
    const [slides, setSlides] = useState<SlideEntry[]>([]);
    const [loadingSlides, setLoadingSlides] = useState(false);
    const [pendingSlideId, setPendingSlideId] = useState<string | null>(null);
    const slidesRef = useRef<SlideEntry[]>([]);
    const lastRequestedBindRef = useRef<string | null>(null);
    const pendingSlideIdRef = useRef<string | null>(null);
    const {
        isDrawing,
        strokeColor,
        setStrokeColor,
        strokeWidth,
        setStrokeWidth,
        strokeDash,
        setStrokeDash,
        currentLine,
        setDrawing,
        toggleDrawing,
        startLine,
        appendLinePoint,
        clearCurrentLine,
        consumeCurrentLine
    } = useControllerStore(
        useShallow((s) => ({
            isDrawing: s.isDrawing,
            strokeColor: s.strokeColor,
            setStrokeColor: s.setStrokeColor,
            strokeWidth: s.strokeWidth,
            setStrokeWidth: s.setStrokeWidth,
            strokeDash: s.strokeDash,
            setStrokeDash: s.setStrokeDash,
            currentLine: s.currentLine,
            setDrawing: s.setDrawing,
            toggleDrawing: s.toggleDrawing,
            startLine: s.startLine,
            appendLinePoint: s.appendLinePoint,
            clearCurrentLine: s.clearCurrentLine,
            consumeCurrentLine: s.consumeCurrentLine
        }))
    );

    // Listen for binding status from bus
    useEffect(() => {
        if (!engine) return;
        return engine.onBindingStatus((status) => {
            setBinding((prev) => {
                if (
                    prev.bound === status.bound &&
                    prev.projectId === status.projectId &&
                    prev.commitId === status.commitId &&
                    prev.slideId === status.slideId
                ) {
                    return prev;
                }
                return status;
            });
        });
    }, [engine]);

    // Fetch slides from the bound commit
    const loadSlides = useCallback(async (commitId: string) => {
        setLoadingSlides(true);
        try {
            const commit = await $getCommit({ data: { id: commitId } });
            if (!commit?.content?.slides) return;
            const commitSlides = commit.content.slides;
            setSlides(
                commitSlides.map((s) => ({
                    ...s,
                    layers: s.layers,
                    layerCount: s.layers.length
                }))
            );
        } catch (e) {
            console.error('Failed to load slides:', e);
        } finally {
            setLoadingSlides(false);
        }
    }, []);

    useEffect(() => {
        if (binding.bound && binding.commitId) {
            loadSlides(binding.commitId);
            lastRequestedBindRef.current = null;
        } else {
            setSlides([]);
            setRequestedSlideId(null);
            setPendingSlideId(null);
            lastRequestedBindRef.current = null;
        }
    }, [binding.bound, binding.commitId, loadSlides]);

    useEffect(() => {
        slidesRef.current = slides;
    }, [slides]);
    useEffect(() => {
        pendingSlideIdRef.current = pendingSlideId;
    }, [pendingSlideId]);

    const upsertLayerOnSlide = useCallback((slideId: string, nextLayer: LayerWithEditorState) => {
        setSlides((prev) =>
            prev.map((slide) => {
                if (slide.id !== slideId) return slide;
                const existingIndex = slide.layers.findIndex(
                    (l) => l.numericId === nextLayer.numericId
                );
                const nextLayers = [...slide.layers];
                if (existingIndex >= 0) {
                    nextLayers[existingIndex] = nextLayer;
                } else {
                    nextLayers.push(nextLayer);
                }
                return {
                    ...slide,
                    layers: nextLayers,
                    layerCount: nextLayers.length
                };
            })
        );
    }, []);

    const deleteLayerOnSlide = useCallback((slideId: string, numericId: number) => {
        setSlides((prev) =>
            prev.map((slide) => {
                if (slide.id !== slideId) return slide;
                const nextLayers = slide.layers.filter((l) => l.numericId !== numericId);
                if (nextLayers.length === slide.layers.length) return slide;
                return {
                    ...slide,
                    layers: nextLayers,
                    layerCount: nextLayers.length
                };
            })
        );
    }, []);

    const replaceSlideLayers = useCallback(
        (slideId: string, nextLayers: LayerWithEditorState[]) => {
            setSlides((prev) =>
                prev.map((slide) =>
                    slide.id === slideId
                        ? {
                              ...slide,
                              layers: nextLayers,
                              layerCount: nextLayers.length
                          }
                        : slide
                )
            );
        },
        []
    );

    useEffect(() => {
        if (!engine) return;
        return engine.onMessage((data) => {
            const targetSlideId = binding.slideId ?? requestedSlideId ?? activeSlideId;
            if (!targetSlideId) return;

            if (data.type === 'hydrate') {
                replaceSlideLayers(targetSlideId, data.layers as LayerWithEditorState[]);
                const pendingId = pendingSlideIdRef.current;
                if (pendingId && pendingId === targetSlideId) {
                    setPendingSlideId(null);
                }
                return;
            }
            if (data.type === 'upsert_layer') {
                upsertLayerOnSlide(targetSlideId, data.layer as LayerWithEditorState);
                return;
            }
            if (data.type === 'delete_layer') {
                deleteLayerOnSlide(targetSlideId, data.numericId);
            }
        });
    }, [
        engine,
        binding.slideId,
        requestedSlideId,
        activeSlideId,
        replaceSlideLayers,
        upsertLayerOnSlide,
        deleteLayerOnSlide
    ]);

    // Listen for live slide list updates from other editors
    useEffect(() => {
        if (!engine) return;
        return engine.onSlidesUpdated((updatedSlides) => {
            const currentSlides = slidesRef.current;

            const nextIdSet = new Set(updatedSlides.map((s) => s.id));
            const currentIdSet = new Set(currentSlides.map((s) => s.id));
            const hasStructuralChange =
                updatedSlides.length !== currentSlides.length ||
                updatedSlides.some((s) => !currentIdSet.has(s.id)) ||
                currentSlides.some((s) => !nextIdSet.has(s.id));

            if (hasStructuralChange) {
                if (binding.commitId) void loadSlides(binding.commitId);
                return;
            }

            setSlides((prev) => {
                const byId = new Map(prev.map((slide) => [slide.id, slide]));
                return updatedSlides.map((updated) => {
                    const existing = byId.get(updated.id);
                    if (!existing) {
                        // Safety fallback if local state drifted between event and state update.
                        return {
                            id: updated.id,
                            name: updated.name,
                            order: updated.order,
                            layers: [],
                            layerCount: 0
                        };
                    }
                    return {
                        ...existing,
                        name: updated.name,
                        order: updated.order
                    };
                });
            });
        });
    }, [engine, binding.commitId, loadSlides]);

    // HMR rehydrate
    useEffect(() => {
        if (window.__CONTROLLER_RELOADING__) {
            setTimeout(() => {
                engine?.sendJSON({ type: 'rehydrate_please' });
            }, 500);
            window.__CONTROLLER_RELOADING__ = false;
        }
    }, [engine]);

    // Default to first slide
    useEffect(() => {
        if (!activeSlideId && slides.length > 0) {
            setActiveSlideId(slides[0].id);
            setRequestedSlideId(slides[0].id);
        }
    }, [activeSlideId, slides]);

    useEffect(() => {
        const boundSlideId = binding.slideId;
        if (!boundSlideId) return;
        setActiveSlideId((prev) => (prev === boundSlideId ? prev : boundSlideId));
        setRequestedSlideId((prev) => (prev === boundSlideId ? prev : boundSlideId));
    }, [binding.slideId]);

    useEffect(() => {
        clearCurrentLine();
    }, [activeSlideId, requestedSlideId, binding.slideId, binding.bound, clearCurrentLine]);

    useEffect(() => {
        if (binding.bound) return;
        setDrawing(false);
    }, [binding.bound, setDrawing]);

    useEffect(() => {
        if (!engine || !binding.projectId || !binding.commitId || !requestedSlideId) return;
        const bindKey = `${binding.projectId}:${binding.commitId}:${requestedSlideId}`;
        if (lastRequestedBindRef.current === bindKey) return;
        if (binding.slideId === requestedSlideId) {
            lastRequestedBindRef.current = bindKey;
            return;
        }

        lastRequestedBindRef.current = bindKey;
        engine.bindSlide(binding.projectId, binding.commitId, requestedSlideId);
    }, [engine, binding.projectId, binding.commitId, binding.slideId, requestedSlideId]);

    useEffect(() => {
        if (!pendingSlideId) return;
        if (binding.slideId === pendingSlideId) {
            setPendingSlideId(null);
        }
    }, [binding.slideId, pendingSlideId]);

    const activeLayers = useMemo(() => {
        const slide = slides.find((s) => s.id === activeSlideId);
        return (slide?.layers ?? []) as LayerWithEditorState[];
    }, [slides, activeSlideId]);

    const sortedLayers = useMemo(
        () => [...activeLayers].sort((a, b) => a.config.zIndex - b.config.zIndex),
        [activeLayers]
    );
    const sortedSlides = useMemo(() => [...slides].sort((a, b) => a.order - b.order), [slides]);
    const canDraw = Boolean(engine && binding.bound && activeSlideId);

    const addLineLayer = useCallback(
        (line: number[]) => {
            if (!engine || !activeSlideId || line.length < 6) return;
            const currentSlides = slidesRef.current;
            const targetSlide = currentSlides.find((slide) => slide.id === activeSlideId);
            if (!targetSlide) return;
            const nextLayer = buildLineLayer(
                line,
                strokeColor,
                strokeWidth,
                strokeDash,
                targetSlide.layers
            );
            if (!nextLayer) return;

            upsertLayerOnSlide(activeSlideId, nextLayer);
            engine.sendJSON({
                type: 'upsert_layer',
                origin: 'controller:add_line_layer',
                layer: nextLayer
            });
        },
        [engine, activeSlideId, strokeColor, strokeWidth, strokeDash, upsertLayerOnSlide]
    );

    const getStagePoint = useCallback(
        (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
            const stage = e.target.getStage();
            const point = stage?.getPointerPosition();
            if (!point) return null;
            return {
                x: point.x / stageScaleFactor,
                y: point.y / stageScaleFactor
            };
        },
        [stageScaleFactor]
    );

    const handleDrawStart = useCallback(
        (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
            if (!canDraw || !isDrawing) return;
            const point = getStagePoint(e);
            if (!point) return;
            startLine(point.x, point.y);
        },
        [canDraw, isDrawing, getStagePoint, startLine]
    );

    const handleDrawMove = useCallback(
        (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
            if (!canDraw || !isDrawing || currentLine.length < 2) return;
            const point = getStagePoint(e);
            if (!point) return;
            appendLinePoint(point.x, point.y);
        },
        [canDraw, isDrawing, currentLine.length, getStagePoint, appendLinePoint]
    );

    const handleDrawEnd = useCallback(() => {
        if (!canDraw || !isDrawing) return;
        const line = consumeCurrentLine();
        if (line.length > 6) {
            addLineLayer(line);
        }
    }, [canDraw, isDrawing, consumeCurrentLine, addLineLayer]);

    const handleStageWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
        const slot = stageSlot.current;
        if (!slot) return;
        const delta = e.evt.deltaX + e.evt.deltaY;
        if (delta === 0) return;
        e.evt.preventDefault();
        slot.scrollLeft += delta;
    }, []);

    useLayoutEffect(() => {
        const slot = stageSlot.current;
        if (!slot) return;

        const logicalHeight = SCREEN_H * ROWS;
        const minScale = 0.01;

        const recomputeScale = () => {
            const availableHeight = slot.clientHeight;
            if (availableHeight <= 0) return;
            const maxVerticalScale = Math.max(minScale, availableHeight / logicalHeight);
            setStageScaleFactor((prev) =>
                Math.abs(prev - maxVerticalScale) < 0.0005 ? prev : maxVerticalScale
            );
        };

        recomputeScale();
        const observer = new ResizeObserver(recomputeScale);
        observer.observe(slot);

        return () => observer.disconnect();
    }, []);

    if (loadingSlides)
        return (
            <div
                className={cn(
                    'container flex h-full max-h-full min-h-0 min-w-full flex-col items-center justify-center overflow-hidden bg-background',
                    showHideHeadAndFoot
                        ? 'fixed inset-0 top-0 right-0 bottom-0 left-0 z-1000! p-0'
                        : 'pt-18 pb-13'
                )}
            >
                <CircleNotchIcon className="animate-spin" />
            </div>
        );

    return (
        <div
            className={cn(
                'container flex h-full max-h-full min-h-0 min-w-full flex-col overflow-hidden bg-background',
                showHideHeadAndFoot
                    ? 'fixed inset-0 top-0 right-0 bottom-0 left-0 z-1000! p-0'
                    : 'pt-18 pb-13'
            )}
        >
            <ResizablePanelGroup
                orientation="horizontal"
                className="h-full min-h-0 w-full overflow-hidden font-sans text-foreground"
            >
                <ResizablePanel className="min-h-0 overflow-hidden">
                    <div className="flex h-full min-h-0 flex-col overflow-hidden">
                        <div className="flex min-h-0 flex-1 overflow-hidden">
                            {/* Canvas area */}
                            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                                <ControllerToolbar
                                    isDrawing={isDrawing}
                                    canDraw={canDraw}
                                    onToggleDrawing={toggleDrawing}
                                    strokeColor={strokeColor}
                                    setStrokeColor={setStrokeColor}
                                    strokeWidth={strokeWidth}
                                    setStrokeWidth={setStrokeWidth}
                                    strokeDash={strokeDash}
                                    setStrokeDash={setStrokeDash}
                                />

                                <ViewerSlatePreview
                                    stageSlot={stageSlot}
                                    stageInstance={stageInstance}
                                    stageScaleFactor={stageScaleFactor}
                                    layers={sortedLayers}
                                />
                                <div
                                    ref={stageSlot}
                                    className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden bg-black"
                                >
                                    <Stage
                                        ref={stageInstance}
                                        width={COLS * SCREEN_W * stageScaleFactor}
                                        height={ROWS * SCREEN_H * stageScaleFactor}
                                        onMouseDown={handleDrawStart}
                                        onMouseMove={handleDrawMove}
                                        onMouseUp={handleDrawEnd}
                                        onWheel={handleStageWheel}
                                        onTouchStart={handleDrawStart}
                                        onTouchMove={handleDrawMove}
                                        onTouchEnd={handleDrawEnd}
                                        scaleX={stageScaleFactor}
                                        scaleY={stageScaleFactor}
                                    >
                                        <KonvaLayer>
                                            {sortedLayers
                                                .filter((layer) => layer.config.visible)
                                                .map((layer) => {
                                                    if (layer.type === 'image') {
                                                        return (
                                                            <ReadOnlyMediaLayer
                                                                key={`img_${layer.numericId}`}
                                                                layer={layer}
                                                            />
                                                        );
                                                    }
                                                    if (layer.type === 'video') {
                                                        return (
                                                            <ReadOnlyMediaLayer
                                                                key={`vid_${layer.numericId}`}
                                                                layer={layer}
                                                            />
                                                        );
                                                    }
                                                    if (layer.type === 'web') {
                                                        return (
                                                            <ReadOnlyMediaLayer
                                                                key={`web_${layer.numericId}`}
                                                                layer={layer}
                                                            />
                                                        );
                                                    }
                                                    if (layer.type === 'text') {
                                                        return (
                                                            <ReadOnlyTextLayer
                                                                key={`txt_${layer.numericId}`}
                                                                layer={layer}
                                                            />
                                                        );
                                                    }
                                                    if (layer.type === 'shape') {
                                                        const common = {
                                                            x: layer.config.cx,
                                                            y: layer.config.cy,
                                                            rotation: layer.config.rotation,
                                                            scaleX: layer.config.scaleX,
                                                            scaleY: layer.config.scaleY,
                                                            fill: layer.fill,
                                                            stroke: layer.strokeColor,
                                                            strokeWidth: layer.strokeWidth,
                                                            listening: false as const
                                                        };
                                                        if (layer.shape === 'rectangle') {
                                                            return (
                                                                <Rect
                                                                    key={`shape_${layer.numericId}`}
                                                                    {...common}
                                                                    width={layer.config.width}
                                                                    height={layer.config.height}
                                                                    offsetX={layer.config.width / 2}
                                                                    offsetY={
                                                                        layer.config.height / 2
                                                                    }
                                                                    dash={layer.strokeDash}
                                                                />
                                                            );
                                                        }
                                                        if (layer.shape === 'circle') {
                                                            return (
                                                                <Circle
                                                                    key={`shape_${layer.numericId}`}
                                                                    {...common}
                                                                    offsetX={layer.config.width / 2}
                                                                    offsetY={
                                                                        layer.config.height / 2
                                                                    }
                                                                    radius={layer.config.width / 2}
                                                                    dash={layer.strokeDash}
                                                                />
                                                            );
                                                        }
                                                    }
                                                    if (layer.type === 'line') {
                                                        return (
                                                            <Line
                                                                key={`lin_${layer.numericId}`}
                                                                points={layer.line}
                                                                stroke={layer.strokeColor}
                                                                strokeWidth={layer.strokeWidth}
                                                                dash={layer.strokeDash}
                                                                dashEnabled={true}
                                                                tension={0.4}
                                                                lineCap="round"
                                                                lineJoin="round"
                                                                listening={false}
                                                            />
                                                        );
                                                    }
                                                    if (layer.type === 'map') {
                                                        return (
                                                            <Rect
                                                                key={`map_${layer.numericId}`}
                                                                x={layer.config.cx}
                                                                y={layer.config.cy}
                                                                width={layer.config.width}
                                                                height={layer.config.height}
                                                                scaleX={layer.config.scaleX}
                                                                scaleY={layer.config.scaleY}
                                                                offsetX={layer.config.width / 2}
                                                                offsetY={layer.config.height / 2}
                                                                rotation={layer.config.rotation}
                                                                fill="#1f2937"
                                                                stroke="#334155"
                                                                strokeWidth={2}
                                                                listening={false}
                                                            />
                                                        );
                                                    }
                                                    if (layer.type === 'graph') {
                                                        return (
                                                            <Rect
                                                                key={`roy_${layer.numericId}`}
                                                                x={layer.config.cx}
                                                                y={layer.config.cy}
                                                                width={layer.config.width}
                                                                height={layer.config.height}
                                                                scaleX={layer.config.scaleX}
                                                                scaleY={layer.config.scaleY}
                                                                offsetX={layer.config.width / 2}
                                                                offsetY={layer.config.height / 2}
                                                                rotation={layer.config.rotation}
                                                                fill="#111827"
                                                                stroke="#374151"
                                                                strokeWidth={2}
                                                                listening={false}
                                                            />
                                                        );
                                                    }
                                                    // Fallback placeholder
                                                    return (
                                                        <Rect
                                                            key={`fallback_${layer.numericId}`}
                                                            x={layer.config.cx}
                                                            y={layer.config.cy}
                                                            width={layer.config.width}
                                                            height={layer.config.height}
                                                            offsetX={layer.config.width / 2}
                                                            offsetY={layer.config.height / 2}
                                                            rotation={layer.config.rotation}
                                                            fill="#555"
                                                            listening={false}
                                                        />
                                                    );
                                                })}
                                            {currentLine.length > 3 && (
                                                <Line
                                                    key="new-line"
                                                    points={currentLine}
                                                    stroke={strokeColor}
                                                    strokeWidth={strokeWidth}
                                                    dash={strokeDash}
                                                    dashEnabled={true}
                                                    tension={0.5}
                                                    lineCap="round"
                                                    lineJoin="round"
                                                    listening={false}
                                                />
                                            )}
                                        </KonvaLayer>
                                    </Stage>
                                </div>
                            </div>
                        </div>
                    </div>
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel
                    defaultSize={300}
                    minSize={200}
                    className="min-h-0 overflow-hidden border-t border-border"
                >
                    {/* Slide list sidebar */}
                    <div className="flex h-full min-h-0 w-full flex-col border-l border-border">
                        <div className="flex h-11 shrink-0 cursor-pointer items-center justify-between border-b border-border bg-muted/50 px-4">
                            <h2 className="flex items-center gap-2 text-sm font-semibold">
                                <SlideshowIcon size={18} weight="bold" /> Slides
                            </h2>
                        </div>
                        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                            {sortedSlides.map((slide) => (
                                <button
                                    key={slide.id}
                                    onPointerDown={() => {
                                        if (slide.id !== activeSlideId) {
                                            setPendingSlideId(slide.id);
                                        }
                                    }}
                                    onClick={() => {
                                        if (slide.id === activeSlideId) {
                                            setPendingSlideId(null);
                                            return;
                                        }
                                        setPendingSlideId(slide.id);
                                        startTransition(() => {
                                            setActiveSlideId(slide.id);
                                        });
                                        setRequestedSlideId(slide.id);
                                    }}
                                    className={`w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-card/50 ${
                                        activeSlideId === slide.id || requestedSlideId === slide.id
                                            ? 'bg-primary/10 text-primary'
                                            : 'text-muted-foreground hover:bg-accent'
                                    }`}
                                >
                                    <span className="flex items-center justify-between gap-2">
                                        <span className="font-medium">Slide {slide.name}</span>
                                        {pendingSlideId === slide.id ? (
                                            <CircleNotchIcon
                                                size={14}
                                                className="shrink-0 animate-spin"
                                            />
                                        ) : null}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}
