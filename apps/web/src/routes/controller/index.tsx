import { CircleNotchIcon, SlideshowIcon } from '@phosphor-icons/react';
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup
} from '@repo/ui/components/resizable';
import { cn } from '@repo/ui/lib/utils';
import { createFileRoute, useLocation } from '@tanstack/react-router';
import Konva from 'konva';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer as KonvaLayer, Rect, Circle, Line } from 'react-konva';

import { ControllerToolbar } from '~/components/ControllerToolbar';
import { ReadOnlyMediaLayer, ReadOnlyTextLayer } from '~/components/ReadOnlyLayers';
import { ViewerSlatePreview } from '~/components/ViewerSlatePreview';
import { ControllerEngine } from '~/lib/controllerEngine';
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

function Controller() {
    const stageSlot = useRef<HTMLDivElement>(null);
    const stageInstance = useRef<Konva.Stage>(null);
    const [stageScaleFactor, setStageScaleFactor] = useState(DEFAULT_STAGE_SCALE_FACTOR);
    const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
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
    const lastRequestedBindRef = useRef<string | null>(null);

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
            lastRequestedBindRef.current = null;
        }
    }, [binding.bound, binding.commitId, loadSlides]);

    // Listen for live slide list updates from other editors
    useEffect(() => {
        if (!engine) return;
        return engine.onSlidesUpdated((updatedSlides) => {
            setSlides((prev) =>
                updatedSlides.map((s) => ({
                    ...s,
                    layerCount: prev.find((existing) => existing.id === s.id)?.layerCount ?? 0
                }))
            );
        });
    }, [engine]);

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
        }
    }, [activeSlideId, slides]);

    useEffect(() => {
        if (!engine || !binding.projectId || !binding.commitId || !activeSlideId) return;
        const bindKey = `${binding.projectId}:${binding.commitId}:${activeSlideId}`;
        if (lastRequestedBindRef.current === bindKey) return;
        if (binding.slideId === activeSlideId) {
            lastRequestedBindRef.current = bindKey;
            return;
        }

        lastRequestedBindRef.current = bindKey;
        engine.bindSlide(binding.projectId, binding.commitId, activeSlideId);
    }, [engine, binding.projectId, binding.commitId, binding.slideId, activeSlideId]);

    const activeLayers = useMemo(() => {
        const slide = slides.find((s) => s.id === activeSlideId);
        return (slide?.layers ?? []) as LayerWithEditorState[];
    }, [slides, activeSlideId]);

    const sortedLayers = useMemo(
        () => [...activeLayers].sort((a, b) => a.config.zIndex - b.config.zIndex),
        [activeLayers]
    );

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
                                <ControllerToolbar />

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
                            {slides
                                .sort((a, b) => a.order - b.order)
                                .map((slide) => (
                                    <button
                                        key={slide.id}
                                        onClick={() => setActiveSlideId(slide.id)}
                                        className={`w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-card/50 ${
                                            activeSlideId === slide.id
                                                ? 'bg-primary/10 text-primary'
                                                : 'text-muted-foreground hover:bg-accent'
                                        }`}
                                    >
                                        <span className="font-medium">Slide {slide.name}</span>
                                    </button>
                                ))}
                        </div>
                    </div>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}
