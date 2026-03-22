import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import { Stage, Layer as KonvaLayer, Transformer, Rect, Line, Circle } from 'react-konva';

import { EditorToolbar } from '~/components/EditorToolbar';
import { KonvaStaticImage } from '~/components/KonvaStaticImage';
import { KonvaTextLayer } from '~/components/KonvaTextLayer';
import { KonvaVideo } from '~/components/KonvaVideo';
import { KonvaWebLayer } from '~/components/KonvaWebLayer';
import { RoyStaticRenderer } from '~/components/roygraph/RoyStaticRenderer';
import { EditorEngine } from '~/lib/editorEngine';
import { getDOGridLines } from '~/lib/editorHelpers';
import { useEditorStore } from '~/lib/editorStore';
import { fitSizeToViewport } from '~/lib/fitSizeToViewport';
// import { RoyForceGraph } from '~/components/roygraph/RoyForceGraph';
import type { Layer, LayerWithEditorState } from '~/lib/types';

// import DOPreview from './DOPreview';
import { SlatePreview } from './SlatePreview';

const engine = EditorEngine.getInstance();

const DEFAULT_STAGE_SCALE_FACTOR = 0.15;
const SCREEN_W = 1920;
const SCREEN_H = 1080;
// Square snap grid aligned with physical screen boundaries:
// 1920 % 120 === 0 and 1080 % 120 === 0
const SNAP_GRID = 120;
const COLS = 16;
const ROWS = 4;

function normalizeRotationToQuadrant(rotation: number): number {
    return ((Math.round(rotation) % 360) + 360) % 360;
}

function isCardinalRotation(rotation: number): boolean {
    const normalized = normalizeRotationToQuadrant(rotation);
    return normalized === 0 || normalized === 90 || normalized === 180 || normalized === 270;
}

function snapToGrid(value: number, grid: number): number {
    return Math.round(value / grid) * grid;
}

function getDistance(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

function getAngle(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    return (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
}

function getAngleDelta(current: number, previous: number): number {
    // Keep delta in [-180, 180] to avoid wrap-around jumps at the -180/180 boundary.
    return ((current - previous + 540) % 360) - 180;
}

function touchToStagePoint(stage: Konva.Stage, touch: Touch): { x: number; y: number } {
    const rect = stage.container().getBoundingClientRect();
    const pointer = {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
    };
    const transform = stage.getAbsoluteTransform().copy();
    transform.invert();
    return transform.point(pointer);
}

export function EditorSlate() {
    const layers = useEditorStore((s) => s.layers);
    // TODO This probably requires some attention: The Konva Stage only selects one item at a time, but we use the multi-select layer sorter here.
    const selectedLayerIds = useEditorStore((s) => s.selectedLayerIds);
    const toggleLayerSelection = useEditorStore((s) => s.toggleLayerSelection);
    const deselectAllLayers = useEditorStore((s) => s.deselectAllLayers);
    const startTextEditing = useEditorStore((s) => s.startTextEditing);
    const showGrid = useEditorStore((s) => s.showGrid);
    const isDrawing = useEditorStore((s) => s.isDrawing);
    const isSnapping = useEditorStore((s) => s.isSnapping);
    const addLineLayer = useEditorStore((s) => s.addLineLayer);
    const strokeColor = useEditorStore((s) => s.strokeColor);
    const strokeDash = useEditorStore((s) => s.strokeDash);
    const strokeWidth = useEditorStore((s) => s.strokeWidth);

    const [stageScaleFactor, setStageScaleFactor] = useState(DEFAULT_STAGE_SCALE_FACTOR);
    const [isPinching, setIsPinching] = useState(false);
    const [currentLine, setCurrentLine] = useState<Array<number>>([]);
    const editingTextLayerId = useEditorStore((s) => s.editingTextLayerId);
    const lastX = useRef(0);
    const stageLastX = useRef(0);

    const stageSlot = useRef<HTMLDivElement>(null);
    const stageWrapper = useRef<HTMLDivElement>(null);
    const stageInstance = useRef<Konva.Stage>(null);
    const trRef = useRef<Konva.Transformer>(null);
    const lastCenter = useRef<{ x: number; y: number } | null>(null);
    const lastDist = useRef<number | null>(null);
    const lastAngle = useRef<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const sortedLayers = useMemo(
        () => Array.from(layers.values()).sort((a, b) => a.config.zIndex - b.config.zIndex),
        [layers]
    );
    const selectedLayerIdSet = useMemo(() => new Set(selectedLayerIds), [selectedLayerIds]);

    const syncInsertionCenter = useCallback(() => {
        const slot = stageSlot.current;
        if (!slot) return;
        const scale = Math.max(stageScaleFactor, 0.001);
        const centerX = (slot.scrollLeft + slot.clientWidth / 2) / scale;
        const centerY = (slot.scrollTop + slot.clientHeight / 2) / scale;
        const viewportWidth = slot.clientWidth / scale;
        const viewportHeight = slot.clientHeight / scale;
        const store = useEditorStore.getState();
        store.setInsertionCenter(centerX, centerY);
        store.setInsertionViewport(viewportWidth, viewportHeight);
    }, [stageScaleFactor]);

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

    useEffect(() => {
        const slot = stageSlot.current;
        if (!slot) return;

        let rafId: number | null = null;

        const scheduleSync = () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                syncInsertionCenter();
                rafId = null;
            });
        };

        scheduleSync();
        slot.addEventListener('scroll', scheduleSync, { passive: true });
        window.addEventListener('resize', scheduleSync);

        return () => {
            slot.removeEventListener('scroll', scheduleSync);
            window.removeEventListener('resize', scheduleSync);
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, [syncInsertionCenter]);

    // Shadow ref — keeps binary-updated positions for the fast-path.
    // Binary updates mutate this directly (no React re-render).
    const layersRef = useRef<Map<number, LayerWithEditorState>>(new Map());
    useEffect(() => {
        layersRef.current = layers;
    }, [layers]);

    useEffect(() => {
        if (window.__EDITOR_RELOADING__) {
            setTimeout(() => {
                engine.sendJSON({ type: 'rehydrate_please' });
            }, 500);
            window.__EDITOR_RELOADING__ = false;
        }
    }, []);

    // JSON messages are handled by the store wiring in editorStore.ts.
    // Only the binary path stays here because it directly manipulates Konva nodes.
    useEffect(() => {
        const unsubscribeBinary = engine.subscribeToBinary(
            (id, cx, cy, width, height, scaleX, scaleY, rotation) => {
                if (trRef.current) {
                    const stage = trRef.current.getStage();
                    const node = stage?.findOne(`#${id}`);
                    const currentSelectedIds = useEditorStore.getState().selectedLayerIds;
                    const isActivelyTransforming = trRef.current.isTransforming();

                    if (node && !node.isDragging() && !isActivelyTransforming && !isPinching) {
                        node.x(cx);
                        node.y(cy);
                        node.width(width);
                        node.height(height);
                        node.offsetX(width / 2);
                        node.offsetY(height / 2);
                        node.scaleX(scaleX);
                        node.scaleY(scaleY);
                        node.rotation(rotation);
                        if (currentSelectedIds[0] === id.toString()) trRef.current.forceUpdate();
                        node.getLayer()?.batchDraw();
                    }

                    // Shadow state — so React reads accurate coords on next render
                    const shadowLayer = layersRef.current.get(id);
                    if (shadowLayer) {
                        shadowLayer.config.cx = cx;
                        shadowLayer.config.cy = cy;
                        shadowLayer.config.width = width;
                        shadowLayer.config.height = height;
                        shadowLayer.config.scaleX = scaleX;
                        shadowLayer.config.scaleY = scaleY;
                        shadowLayer.config.rotation = rotation;

                        // Text reflow must follow binary width/height updates (local + remote),
                        // so we sync store config for text layers from the fast path.
                        if (shadowLayer.type === 'text') {
                            useEditorStore.setState((s) => {
                                const current = s.layers.get(id);
                                if (!current || current.type !== 'text') return s;
                                const cfg = current.config;
                                if (
                                    cfg.cx === cx &&
                                    cfg.cy === cy &&
                                    cfg.width === width &&
                                    cfg.height === height &&
                                    cfg.scaleX === scaleX &&
                                    cfg.scaleY === scaleY &&
                                    cfg.rotation === rotation
                                ) {
                                    return s;
                                }
                                const newLayers = new Map(s.layers);
                                newLayers.set(id, {
                                    ...current,
                                    config: {
                                        ...cfg,
                                        cx,
                                        cy,
                                        width,
                                        height,
                                        scaleX,
                                        scaleY,
                                        rotation
                                    }
                                });
                                return { layers: newLayers };
                            });
                        }
                    }
                }
            }
        );

        return () => unsubscribeBinary();
    }, [isPinching]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (editingTextLayerId !== null) return;
            const store = useEditorStore.getState();
            if (!store.selectedLayerIds.length) return;

            if (e.key === 'Delete') store.deleteSelectedLayer();
            if (e.key === 'Escape') store.deselectAllLayers();
            const currentSelected = store.layers.get(parseInt(store.selectedLayerIds[0]));
            if (!currentSelected) return;

            const newLayerState = { ...currentSelected, config: { ...currentSelected.config } };
            if (e.key === 'ArrowLeft') {
                if (e.shiftKey)
                    newLayerState.config.rotation = Math.round(newLayerState.config.rotation - 1);
                else newLayerState.config.cx -= isSnapping ? SNAP_GRID : 10;
            }
            if (e.key === 'ArrowRight') {
                if (e.shiftKey)
                    newLayerState.config.rotation = Math.round(newLayerState.config.rotation + 1);
                else newLayerState.config.cx += isSnapping ? SNAP_GRID : 10;
            }
            if (e.key === 'ArrowUp') newLayerState.config.cy -= isSnapping ? SNAP_GRID : 10;
            if (e.key === 'ArrowDown') newLayerState.config.cy += isSnapping ? SNAP_GRID : 10;
            store.updateLayerConfig(currentSelected.numericId, newLayerState.config);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [editingTextLayerId, isSnapping]);

    // ── Upload handler (stays here — complex async + file APIs) ───────────
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isImage = file.type.startsWith('image/');
        const localUrl = URL.createObjectURL(file);

        let mediaWidth = 800;
        let mediaHeight = 600;
        let duration = 0;
        let previewDataUrl = localUrl;

        // 1. Read dimensions and extract a poster frame locally
        if (isImage) {
            const img = new window.Image();
            const p = new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
            });
            if (!localUrl.startsWith('blob:') && !localUrl.startsWith('data:')) {
                img.crossOrigin = 'anonymous';
            }
            img.src = localUrl;
            await p;
            mediaWidth = img.width;
            mediaHeight = img.height;
        } else {
            const tempVid = document.createElement('video');
            tempVid.muted = true;
            tempVid.playsInline = true;
            const p = new Promise((resolve) => (tempVid.onloadeddata = resolve));
            if (!localUrl.startsWith('blob:') && !localUrl.startsWith('data:')) {
                tempVid.crossOrigin = 'anonymous';
            }
            tempVid.src = localUrl;
            await p;
            mediaWidth = tempVid.videoWidth;
            mediaHeight = tempVid.videoHeight;
            duration = tempVid.duration;

            tempVid.currentTime = Math.min(0.5, duration / 2);
            await new Promise((resolve) => {
                tempVid.onseeked = () => {
                    requestAnimationFrame(() => requestAnimationFrame(resolve));
                };
            });

            const canvas = document.createElement('canvas');
            canvas.width = mediaWidth;
            canvas.height = mediaHeight;
            canvas.getContext('2d')?.drawImage(tempVid, 0, 0, mediaWidth, mediaHeight);
            previewDataUrl = canvas.toDataURL('image/jpeg', 0.8);

            tempVid.removeAttribute('src');
            tempVid.load();
        }

        const store = useEditorStore.getState();
        const numericId = store.allocateId();
        const zIndex = store.allocateZIndex();
        const { x: insertionX, y: insertionY } = store.insertionCenter;
        const fitted = fitSizeToViewport(
            mediaWidth,
            mediaHeight,
            store.insertionViewport.width,
            store.insertionViewport.height
        );

        const positions = {
            cx: insertionX,
            cy: insertionY,
            width: fitted.width,
            height: fitted.height,
            rotation: 0,
            scaleX: 1,
            scaleY: 1
        };

        const config: Layer['config'] = { ...positions, zIndex, visible: true };

        const defaultPlayback: Extract<Layer, { type: 'video' }>['playback'] = {
            status: 'paused',
            anchorMediaTime: 0,
            anchorServerTime: engine.getServerTime()
        };

        // 2. OPTIMISTIC UPDATE — mount immediately
        const optimisticLayer = {
            numericId,
            type: isImage ? 'image' : 'video',
            url: previewDataUrl,
            playback: defaultPlayback,
            config,
            isUploading: true,
            progress: 0,
            rvfcActive: false,
            duration,
            loop: true
        } as LayerWithEditorState;

        store.upsertLayer(optimisticLayer);
        store.toggleLayerSelection(numericId.toString(), false, false);

        // 3. Background tus upload with metadata for server-side post-processing
        const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        const currentProjectId = useEditorStore.getState().projectId;

        const uppy = new Uppy().use(Tus, {
            endpoint: '/api/uploads/',
            chunkSize: 5 * 1024 * 1024
        });

        try {
            uppy.addFile({
                name: file.name,
                type: file.type,
                data: file,
                meta: {
                    numericId: numericId.toString(),
                    duration: duration.toString(),
                    projectId: currentProjectId ?? ''
                }
            });
        } catch (err) {
            console.error('Upload add-file failure', err);
            useEditorStore.getState().removeLayer(numericId);
            uppy.destroy();
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        uppy.on('upload-success', (_file, response) => {
            // Derive asset URL from the tus upload ID
            const uploadId = response.uploadURL?.split('/').pop() ?? '';
            const assetFilename = isImage ? `${uploadId}${ext}` : `${uploadId}.mp4`;
            const assetUrl = `${window.location.origin}/api/assets/${assetFilename}`;
            const stillImageFilename = isImage ? undefined : `${uploadId}_preview.jpg`;

            // Grab freshest config from shadow state (user may have moved the preview)
            const freshestLayer = layersRef.current.get(numericId) || optimisticLayer;

            // 4. Lock it in with preserved transformations
            const finalizedLayer = {
                ...freshestLayer,
                url: assetUrl,
                isUploading: false,
                ...(stillImageFilename ? { stillImage: stillImageFilename } : {})
            };

            useEditorStore.getState().upsertLayer(finalizedLayer);
            engine.setPlayback(numericId, defaultPlayback);

            engine.sendJSON({
                type: 'upsert_layer',
                origin: 'editor:handle_upload',
                layer: {
                    numericId,
                    type: finalizedLayer.type,
                    playback: defaultPlayback,
                    url: assetUrl,
                    config: freshestLayer.config
                } as LayerWithEditorState
            });
            URL.revokeObjectURL(localUrl);

            // Asset record is created server-side in onUploadFinish
            uppy.destroy();
        });

        uppy.on('error', (err) => {
            console.error('Upload failure', err);
            useEditorStore.getState().removeLayer(numericId);
            uppy.destroy();
        });

        uppy.upload();
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleTransform = (e: Pick<KonvaEventObject<Event>, 'target'>, numericId: number) => {
        const node = e.target as Konva.Shape;
        const layer = layersRef.current.get(numericId);
        if (!node || !layer) return;
        const activeAnchor = trRef.current?.getActiveAnchor() ?? null;
        node.setAttr('lastActiveAnchor', activeAnchor);

        if (layer.type === 'text') {
            const textAnchor = activeAnchor ?? '';
            const isHorizontalEdge = textAnchor === 'middle-left' || textAnchor === 'middle-right';
            const isVerticalEdge = textAnchor === 'top-center' || textAnchor === 'bottom-center';
            const isReflowEdge = isHorizontalEdge || isVerticalEdge;
            const mode: 'reflow' | 'corner' = isReflowEdge ? 'reflow' : 'corner';
            node.setAttr('textTransformMode', mode);

            if (mode === 'reflow') {
                const oldAbsTransform = node.getAbsoluteTransform().copy();
                const originWorld = oldAbsTransform.point({ x: 0, y: 0 });
                const oldScaleX = layer.config.scaleX || 1;
                const oldScaleY = layer.config.scaleY || 1;
                let nextWidth = node.width();
                let nextHeight = node.height();

                if (isHorizontalEdge) {
                    const effectiveScaleX = node.scaleX();
                    nextWidth = Math.max(20, (node.width() * effectiveScaleX) / oldScaleX);
                }
                if (isVerticalEdge) {
                    const effectiveScaleY = node.scaleY();
                    nextHeight = Math.max(20, (node.height() * effectiveScaleY) / oldScaleY);
                }

                node.width(nextWidth);
                node.height(nextHeight);
                node.offsetX(nextWidth / 2);
                node.offsetY(nextHeight / 2);
                node.scaleX(oldScaleX);
                node.scaleY(oldScaleY);

                const newAbsTransform = node.getAbsoluteTransform().copy();
                const newOriginWorld = newAbsTransform.point({ x: 0, y: 0 });
                const dx = originWorld.x - newOriginWorld.x;
                const dy = originWorld.y - newOriginWorld.y;
                const parent = node.getParent();
                if (parent) {
                    const parentTransform = parent.getAbsoluteTransform().copy();
                    parentTransform.invert();
                    const localDelta = parentTransform.point({ x: dx, y: dy });
                    node.position({ x: node.x() + localDelta.x, y: node.y() + localDelta.y });
                }

                // TODO See if this can be further optimised so that we can propagate to the other editors too
                // It is s goo compromise for now
                // Immediate local mirror update for live reflow while dragging.
                // We still broadcast binary updates so all peers stay in sync.
                const mirroredConfig: Layer['config'] = {
                    ...layer.config,
                    cx: Math.round(node.x()),
                    cy: Math.round(node.y()),
                    width: Math.max(20, Math.round(node.width())),
                    height: Math.max(20, Math.round(node.height())),
                    scaleX: oldScaleX,
                    scaleY: oldScaleY,
                    rotation: Math.round(node.rotation())
                };
                layer.config = mirroredConfig;
                useEditorStore.setState((s) => {
                    const current = s.layers.get(numericId);
                    if (!current || current.type !== 'text') return s;
                    const newLayers = new Map(s.layers);
                    newLayers.set(numericId, { ...current, config: mirroredConfig });
                    return { layers: newLayers };
                });
            }

            node.getLayer()?.batchDraw();
        }

        // Scale baking for image/map layers
        if (
            layer.type === 'image' ||
            layer.type === 'map' ||
            layer.type === 'shape' ||
            layer.type === 'web'
        ) {
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();

            const oldAbsTransform = node.getAbsoluteTransform().copy();
            const originWorld = oldAbsTransform.point({ x: 0, y: 0 });

            const newWidth = node.width() * scaleX;
            const newHeight = node.height() * scaleY;
            node.width(newWidth);
            node.height(newHeight);
            node.scale({ x: 1, y: 1 });
            node.offsetX(newWidth / 2);
            node.offsetY(newHeight / 2);

            const newAbsTransform = node.getAbsoluteTransform().copy();
            const newOriginWorld = newAbsTransform.point({ x: 0, y: 0 });

            const dx = originWorld.x - newOriginWorld.x;
            const dy = originWorld.y - newOriginWorld.y;

            const parent = node.getParent();
            if (parent) {
                const parentTransform = parent.getAbsoluteTransform().copy();
                parentTransform.invert();
                const localDelta = parentTransform.point({ x: dx, y: dy });
                node.position({ x: node.x() + localDelta.x, y: node.y() + localDelta.y });
            } else {
                node.position({ x: node.x(), y: node.y() });
            }
        }

        engine.broadcastBinaryMove(
            numericId,
            Math.round(node.x()),
            Math.round(node.y()),
            Math.round(node.width()),
            Math.round(node.height()),
            Math.round(node.scaleX() * 1000) / 1000,
            Math.round(node.scaleY() * 1000) / 1000,
            Math.round(node.rotation())
        );
    };

    const handleTransformEnd = useCallback(
        (e: Pick<KonvaEventObject<Event>, 'target' | 'type'>, numericId: number) => {
            const node = e.target as Konva.Shape;

            // Must use layersRef — has binary-updated positions
            const layerToUpdate = layersRef.current.get(numericId);
            if (!layerToUpdate) return;
            const textMode = node.getAttr('textTransformMode') as 'reflow' | 'corner' | undefined;

            if (isSnapping && layerToUpdate.type !== 'line') {
                const rotation = normalizeRotationToQuadrant(node.rotation());

                // Drag end: snap a stable visual reference (top-left of AABB) to the grid.
                if (e.type === 'dragend') {
                    const left = node.x() - node.width() / 2;
                    const top = node.y() - node.height() / 2;
                    const snappedLeft = snapToGrid(left, SNAP_GRID);
                    const snappedTop = snapToGrid(top, SNAP_GRID);
                    node.position({
                        x: snappedLeft + node.width() / 2,
                        y: snappedTop + node.height() / 2
                    });
                }

                // Transform end: snap only moved edges and keep pinned edges/corner stable.
                if (e.type === 'transformend' && isCardinalRotation(rotation)) {
                    const anchor = node.getAttr('lastActiveAnchor') as string | null;
                    const left = node.x() - node.width() / 2;
                    const right = node.x() + node.width() / 2;
                    const top = node.y() - node.height() / 2;
                    const bottom = node.y() + node.height() / 2;

                    let nextLeft = left;
                    let nextRight = right;
                    let nextTop = top;
                    let nextBottom = bottom;

                    if (anchor?.includes('left')) {
                        // Moving the left edge -> keep right edge pinned
                        nextLeft = snapToGrid(left, SNAP_GRID);
                    } else if (anchor?.includes('right')) {
                        // Moving the right edge -> keep left edge pinned
                        nextRight = snapToGrid(right, SNAP_GRID);
                    } else {
                        // No horizontal handle (e.g. top-center/bottom-center): snap by position
                        const snappedLeft = snapToGrid(left, SNAP_GRID);
                        const deltaX = snappedLeft - left;
                        nextLeft += deltaX;
                        nextRight += deltaX;
                    }

                    if (anchor?.includes('top')) {
                        // Moving the top edge -> keep bottom edge pinned
                        nextTop = snapToGrid(top, SNAP_GRID);
                    } else if (anchor?.includes('bottom')) {
                        // Moving the bottom edge -> keep top edge pinned
                        nextBottom = snapToGrid(bottom, SNAP_GRID);
                    } else {
                        // No vertical handle (e.g. middle-left/middle-right): snap by position
                        const snappedTop = snapToGrid(top, SNAP_GRID);
                        const deltaY = snappedTop - top;
                        nextTop += deltaY;
                        nextBottom += deltaY;
                    }

                    const nextWidth = Math.max(20, nextRight - nextLeft);
                    const nextHeight = Math.max(20, nextBottom - nextTop);

                    node.width(nextWidth);
                    node.height(nextHeight);
                    node.offsetX(nextWidth / 2);
                    node.offsetY(nextHeight / 2);
                    node.position({
                        x: nextLeft + nextWidth / 2,
                        y: nextTop + nextHeight / 2
                    });
                }
                node.getLayer()?.batchDraw();
            }

            const updatedConfig: Layer['config'] = {
                ...layerToUpdate.config,
                cx: Math.round(node.x()),
                cy: Math.round(node.y()),
                width: Math.round(node.width()),
                height: Math.round(node.height()),
                scaleX:
                    layerToUpdate.type === 'text' && textMode === 'reflow'
                        ? layerToUpdate.config.scaleX
                        : Math.round(node.scaleX() * 1000) / 1000,
                scaleY:
                    layerToUpdate.type === 'text' && textMode === 'reflow'
                        ? layerToUpdate.config.scaleY
                        : Math.round(node.scaleY() * 1000) / 1000,
                rotation: Math.round(node.rotation())
            };

            if (layerToUpdate.type === 'text' && textMode === 'reflow') {
                node.scaleX(updatedConfig.scaleX);
                node.scaleY(updatedConfig.scaleY);
            }

            // Always broadcast the final authoritative transform after local snapping/baking.
            // This prevents walls from remaining on the last pre-snap binary frame.
            engine.broadcastBinaryMove(
                numericId,
                updatedConfig.cx,
                updatedConfig.cy,
                updatedConfig.width,
                updatedConfig.height,
                updatedConfig.scaleX,
                updatedConfig.scaleY,
                updatedConfig.rotation
            );

            // Shadow mutation for binary fast-path
            layerToUpdate.config = updatedConfig;
            node.setAttr('textTransformMode', undefined);
            node.setAttr('lastActiveAnchor', undefined);

            const store = useEditorStore.getState();
            store.toggleLayerSelection(numericId.toString(), false, false);
            store.updateLayerConfig(numericId, updatedConfig);

            // Sync to server
            engine.sendJSON({
                type: 'upsert_layer',
                origin: 'editor:handle_transform_end',
                layer: { ...layerToUpdate, config: updatedConfig }
            });
        },
        [isSnapping]
    );

    const flushNodeState = (idToFlush: string) => {
        if (!trRef.current) return;
        const stage = trRef.current.getStage();
        const node = stage?.findOne<Konva.Shape>(`#${idToFlush}`);
        if (node)
            handleTransformEnd(
                { target: node, type: 'transformend' } as Pick<
                    KonvaEventObject<Event>,
                    'target' | 'type'
                >,
                parseInt(idToFlush)
            );
    };

    const handleStageInteractionStart = (e: KonvaEventObject<TouchEvent | MouseEvent>) => {
        const currentSelectedIds = useEditorStore.getState().selectedLayerIds;
        if (
            (e.evt instanceof TouchEvent && e.evt.touches?.length === 1) ||
            e.type === 'mousedown'
        ) {
            const clickedOnEmpty = e.target === e.target.getStage();
            if (clickedOnEmpty && currentSelectedIds.length) {
                flushNodeState(currentSelectedIds[0]);
                deselectAllLayers();
            }
            return;
        }
        if (
            e.evt instanceof TouchEvent &&
            e.evt.touches?.length === 2 &&
            currentSelectedIds.length > 0
        ) {
            flushNodeState(currentSelectedIds[0]);
            setIsPinching(true);
            const stage = trRef.current?.getStage();
            if (!stage) return;
            const t1 = e.evt.touches[0];
            const t2 = e.evt.touches[1];
            const p1 = touchToStagePoint(stage, t1);
            const p2 = touchToStagePoint(stage, t2);
            lastDist.current = getDistance(p1, p2);
            lastAngle.current = getAngle(p1, p2);
            lastCenter.current = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            return;
        }
        if (e.evt instanceof TouchEvent && e.evt.touches?.length === 2) {
            lastX.current = e.evt.touches[0].clientX;
            if (stageSlot.current) {
                stageLastX.current = stageSlot.current.scrollLeft;
            }
            return;
        }
    };

    const handleTouchMove = (e: KonvaEventObject<TouchEvent>) => {
        e.evt.preventDefault();
        const currentSelectedIds = useEditorStore.getState().selectedLayerIds;
        if (isDrawing) {
            const stage = e.target.getStage();
            const point = stage?.getPointerPosition();
            if (!point) return;
            setCurrentLine((l) =>
                l.concat([point.x / stageScaleFactor, point.y / stageScaleFactor])
            );
            return;
        }
        if (e.evt.touches.length === 2 && currentSelectedIds.length > 0 && trRef.current) {
            const stage = trRef.current.getStage();
            const node = stage?.findOne(`#${currentSelectedIds[0]}`);
            if (!node) return;
            if (node.isDragging()) node.stopDrag();

            const t1 = e.evt.touches[0];
            const t2 = e.evt.touches[1];
            const p1 = touchToStagePoint(stage!, t1);
            const p2 = touchToStagePoint(stage!, t2);
            const dist = getDistance(p1, p2);
            const angle = getAngle(p1, p2);
            const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

            if (!lastDist.current || !lastAngle.current || !lastCenter.current) return;
            const scaleBy = dist / lastDist.current;
            const angleDelta = getAngleDelta(angle, lastAngle.current);
            const prevCenter = lastCenter.current;
            const radians = (angleDelta * Math.PI) / 180;
            const cos = Math.cos(radians);
            const sin = Math.sin(radians);
            const fromPrevCenterX = node.x() - prevCenter.x;
            const fromPrevCenterY = node.y() - prevCenter.y;
            const rotatedScaledX = (fromPrevCenterX * cos - fromPrevCenterY * sin) * scaleBy;
            const rotatedScaledY = (fromPrevCenterX * sin + fromPrevCenterY * cos) * scaleBy;
            const newX = center.x + rotatedScaledX;
            const newY = center.y + rotatedScaledY;

            const newScaleX = Math.round(node.scaleX() * scaleBy * 1000) / 1000;
            const newScaleY = Math.round(node.scaleY() * scaleBy * 1000) / 1000;
            const canApplyScale =
                newScaleX > 0.1 && newScaleX < 10 && newScaleY > 0.1 && newScaleY < 10;
            if (canApplyScale) {
                node.scaleX(newScaleX);
                node.x(newX);
                node.scaleY(newScaleY);
                node.y(newY);
            }
            node.rotation(node.rotation() + angleDelta);
            trRef.current.getLayer()?.batchDraw();
            engine.broadcastBinaryMove(
                parseInt(currentSelectedIds[0]),
                Math.round(node.x()),
                Math.round(node.y()),
                Math.round(node.width()),
                Math.round(node.height()),
                Math.round(node.scaleX() * 1000) / 1000,
                Math.round(node.scaleY() * 1000) / 1000,
                Math.round(node.rotation())
            );

            lastDist.current = dist;
            lastAngle.current = angle;
            lastCenter.current = center;
            return;
        }
        if (e.evt.touches.length === 2) {
            if (e.evt.targetTouches && e.evt.targetTouches.length > 1) {
                const currentX = e.evt.touches[0].screenX;
                const deltaX = currentX - lastX.current;
                if (stageSlot.current) {
                    stageSlot.current.scrollLeft = stageLastX.current - deltaX;
                }
                return;
            }
        }
    };

    const handleTouchEnd = (e: KonvaEventObject<TouchEvent>) => {
        if (e.evt.touches.length < 2) setIsPinching(false);
        const currentSelectedIds = useEditorStore.getState().selectedLayerIds;
        if (currentSelectedIds.length && trRef.current) {
            const stage = trRef.current.getStage();
            const node = stage?.findOne<Konva.Shape>(`#${currentSelectedIds[0]}`);
            if (node)
                handleTransformEnd(
                    { target: node, type: 'transformend' } as Pick<
                        KonvaEventObject<Event>,
                        'target' | 'type'
                    >,
                    parseInt(currentSelectedIds[0])
                );
        }
        // Without enough point this is probably a missfire
        if (currentLine.length > 6) {
            addLineLayer(currentLine);
        }
        setCurrentLine([]);
        lastDist.current = null;
        lastAngle.current = null;
        lastCenter.current = null;
    };

    useEffect(() => {
        if (selectedLayerIds.length && trRef.current) {
            const node = trRef.current.getStage()?.findOne(`#${selectedLayerIds[0]}`);
            if (node) {
                trRef.current.nodes([node]);
                trRef.current.getLayer()?.batchDraw();
            } else {
                trRef.current.nodes([]);
                trRef.current.getLayer()?.batchDraw();
            }
        } else if (trRef.current) {
            trRef.current.nodes([]);
            trRef.current.getLayer()?.batchDraw();
        }
    }, [selectedLayerIds]);

    return (
        <>
            <EditorToolbar
                fileInputRef={fileInputRef}
                onUpload={handleUpload}
                // onEditText={setEditingTextLayerId}
            />
            <SlatePreview
                stageSlot={stageSlot}
                stageInstance={stageInstance}
                stageScaleFactor={stageScaleFactor}
            />
            <div ref={stageWrapper} className="flex min-h-0 grow flex-col overflow-hidden">
                <div
                    ref={stageSlot}
                    id="slate"
                    className="min-h-0 grow overflow-x-auto overflow-y-hidden border-b border-border bg-black"
                >
                    <Stage
                        ref={stageInstance}
                        width={COLS * SCREEN_W * stageScaleFactor}
                        height={ROWS * SCREEN_H * stageScaleFactor}
                        onMouseDown={handleStageInteractionStart}
                        onTouchStart={handleStageInteractionStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        scaleX={stageScaleFactor}
                        scaleY={stageScaleFactor}
                    >
                        <KonvaLayer>
                            {/* {Array.from({ length: COLS * ROWS }).map((_, i) => {
                            const col = i % COLS;
                            const row = Math.floor(i / COLS);
                            return (
                                <Group key={`screen-${i}`}>
                                    <Rect
                                        x={col * SCREEN_W}
                                        y={row * SCREEN_H}
                                        width={SCREEN_W}
                                        height={SCREEN_H}
                                        stroke="rgba(255, 255, 255, 0.2)"
                                        strokeWidth={10}
                                        listening={false}
                                    />
                                    <Text
                                        x={col * SCREEN_W + 50}
                                        y={row * SCREEN_H + 50}
                                        text={`Screen C:${col} R:${row}`}
                                        fontSize={100}
                                        fill="rgba(255, 255, 255, 0.3)"
                                        listening={false}
                                    />
                                </Group>
                            );
                        })} */}

                            {/* oxlint-disable-next-line react-hooks-js/refs */}
                            {sortedLayers.map((layer) => {
                                const isHidden = !layer.config.visible;
                                const isSelected = selectedLayerIdSet.has(
                                    layer.numericId.toString()
                                );
                                if (isHidden && !isSelected) return null;

                                const hiddenOpacity = isHidden ? 0.3 : 1;

                                const props = {
                                    listening: !isDrawing,
                                    isPinching,
                                    opacity: hiddenOpacity,
                                    onSelect: (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
                                        toggleLayerSelection(
                                            layer.numericId.toString(),
                                            e.evt.shiftKey,
                                            e.evt.ctrlKey || e.evt.metaKey
                                        );
                                    },
                                    onTransform: (e: KonvaEventObject<Event>) =>
                                        handleTransform(e, layer.numericId),
                                    onTransformEnd: (e: KonvaEventObject<Event>) =>
                                        handleTransformEnd(e, layer.numericId)
                                };

                                if (layer.type === 'image') {
                                    return (
                                        <KonvaStaticImage
                                            key={`spi_${layer.numericId}`}
                                            layer={layer}
                                            {...props}
                                        />
                                    );
                                }
                                if (layer.type === 'video')
                                    return (
                                        <KonvaVideo
                                            key={`vid_${layer.numericId}`}
                                            layer={layer}
                                            {...props}
                                        />
                                    );
                                if (layer.type === 'text') {
                                    return (
                                        <KonvaTextLayer
                                            key={`txt_${layer.numericId}`}
                                            layer={layer}
                                            isPinching={props.isPinching}
                                            opacity={hiddenOpacity}
                                            onSelect={props.onSelect}
                                            onDblClick={() => startTextEditing(layer.numericId)}
                                            onTransform={props.onTransform}
                                            onTransformEnd={props.onTransformEnd}
                                        />
                                    );
                                }
                                if (layer.type === 'graph') {
                                    return (
                                        <RoyStaticRenderer
                                            key={`roy_${layer.numericId}`}
                                            layer={layer}
                                            {...props}
                                        />
                                    );
                                }
                                if (layer.type === 'map') {
                                    return (
                                        <Rect
                                            key={`map_${layer.numericId}`}
                                            layer={layer}
                                            fill={'#f00'}
                                            id={layer.numericId.toString()}
                                            x={layer.config.cx}
                                            y={layer.config.cy}
                                            width={layer.config.width}
                                            height={layer.config.height}
                                            scaleX={layer.config.scaleX}
                                            scaleY={layer.config.scaleY}
                                            offsetX={layer.config.width / 2}
                                            offsetY={layer.config.height / 2}
                                            rotation={layer.config.rotation}
                                            opacity={hiddenOpacity}
                                            draggable={!props.isPinching}
                                            onClick={props.onSelect}
                                            onTap={props.onSelect}
                                            onDragMove={props.onTransform}
                                            onTransform={props.onTransform}
                                            onDragEnd={props.onTransformEnd}
                                            onTransformEnd={props.onTransformEnd}
                                        />
                                    );
                                }
                                if (layer.type === 'web') {
                                    return (
                                        <KonvaWebLayer
                                            key={`web_${layer.numericId}`}
                                            layer={layer}
                                            {...props}
                                        />
                                    );
                                }
                                if (layer.type === 'shape') {
                                    const commonProps = {
                                        id: layer.numericId.toString(),
                                        x: layer.config.cx,
                                        y: layer.config.cy,
                                        rotation: layer.config.rotation,
                                        scaleX: layer.config.scaleX,
                                        scaleY: layer.config.scaleY,
                                        opacity: hiddenOpacity,
                                        draggable: !props.isPinching,
                                        onClick: props.onSelect,
                                        onTap: props.onSelect,
                                        onDragMove: props.onTransform,
                                        onTransform: props.onTransform,
                                        onDragEnd: props.onTransformEnd,
                                        onTransformEnd: props.onTransformEnd,
                                        fill: layer.fill,
                                        stroke: layer.strokeColor,
                                        strokeWidth: layer.strokeWidth
                                    };

                                    if (layer.shape === 'rectangle') {
                                        return (
                                            <Rect
                                                key={`shape_${layer.numericId}`}
                                                {...commonProps}
                                                width={layer.config.width}
                                                height={layer.config.height}
                                                offsetX={layer.config.width / 2}
                                                offsetY={layer.config.height / 2}
                                                dash={layer.strokeDash}
                                                dashOffset={(layer.strokeDash[0] ?? 0) / 2}
                                                lineCap="round"
                                                lineJoin="round"
                                            />
                                        );
                                    }
                                    if (layer.shape === 'circle') {
                                        return (
                                            <Circle
                                                key={`shape_${layer.numericId}`}
                                                {...commonProps}
                                                offsetX={layer.config.width / 2}
                                                offsetY={layer.config.height / 2}
                                                radius={layer.config.width / 2}
                                                dash={layer.strokeDash}
                                                lineCap="round"
                                                lineJoin="round"
                                            />
                                        );
                                    }
                                }
                                if (layer.type === 'line') {
                                    return (
                                        <Line
                                            key={`lin_${layer.numericId}`}
                                            listening={true}
                                            opacity={hiddenOpacity}
                                            points={layer.line}
                                            stroke={layer.strokeColor}
                                            strokeWidth={layer.strokeWidth}
                                            dash={layer.strokeDash}
                                            dashEnabled={true}
                                            tension={0.4}
                                            shadowForStrokeEnabled={
                                                selectedLayerIds[0] === layer.numericId.toString()
                                            }
                                            shadowColor="#00a1ff"
                                            shadowBlur={10}
                                            shadowOffsetY={20}
                                            shadowOffsetX={20}
                                            shadowOpacity={1}
                                            lineCap="round"
                                            lineJoin="round"
                                        />
                                    );
                                }
                                return null;
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
                                />
                            )}
                            {showGrid && getDOGridLines(COLS * SCREEN_W, ROWS * SCREEN_H, 20)}
                            <Transformer
                                ref={trRef}
                                flipEnabled={false}
                                anchorCornerRadius={10}
                                anchorSize={20}
                                enabledAnchors={(() => {
                                    const selectedId = selectedLayerIds[0];
                                    if (!selectedId) return undefined;
                                    const selected = layers.get(parseInt(selectedId, 10));
                                    if (selected?.type !== 'text') return undefined;
                                    return [
                                        'top-left',
                                        'top-center',
                                        'top-right',
                                        'middle-left',
                                        'middle-right',
                                        'bottom-left',
                                        'bottom-center',
                                        'bottom-right'
                                    ] as const;
                                })()}
                                boundBoxFunc={(oldBox, newBox) => {
                                    if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5)
                                        return oldBox;
                                    return newBox;
                                }}
                            />
                        </KonvaLayer>
                    </Stage>
                    {/* <RoyForceGraph
                style={{
                    display: 'block',
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    visibility: 'hidden'
                }}
            /> */}
                </div>
            </div>
            {/* {stageInstance.current ? (
                <DOPreview imageUrl={stageInstance.current.toDataURL()} />
            ) : null} */}
        </>
    );
}

// --- VITE HMR DEFENSE STRATEGY ---
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        window.__EDITOR_RELOADING__ = true;
    });
}
