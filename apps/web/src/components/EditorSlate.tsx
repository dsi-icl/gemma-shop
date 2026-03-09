import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer as KonvaLayer, Transformer, Group, Text, Rect } from 'react-konva';

import { KonvaStaticImage } from '~/components/KonvaStaticImage';
import { KonvaVideo } from '~/components/KonvaVideo';
import { PlaybackControls } from '~/components/PlaybackControls';
import { RoyStaticRenderer } from '~/components/roygraph/RoyStaticRenderer';
import { TextEditor } from '~/components/TextEditor';
import { VideoScrubber } from '~/components/VideoScrubber';
import { EditorEngine } from '~/lib/editorEngine';
// import { RoyForceGraph } from '~/components/roygraph/RoyForceGraph';
import type { Layer, LayerWithEditorState } from '~/lib/types';

const engine = EditorEngine.getInstance();

const STAGE_SCALE_FACTOR = 0.1;
const SCREEN_W = 1920;
const SCREEN_H = 1080;
const COLS = 16;
const ROWS = 4;

function getDistance(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

function getAngle(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    return (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
}

export function EditorSlate() {
    const [layers, setLayers] = useState<LayerWithEditorState[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isPinching, setIsPinching] = useState(false);
    const [shadowShape, setShadowShape] = useState<LayerWithEditorState | null>(null);
    const [shouldCenterTransform, setShouldCenterTransform] = useState(false);
    const [shouldMaintainAspectRatio, setShouldMaintainAspectRatio] = useState(true);

    const nextId = useRef(1);
    const nextZIndex = useRef(10);
    const trRef = useRef<Konva.Transformer>(null);
    const lastCenter = useRef<{ x: number; y: number } | null>(null);
    const lastDist = useRef<number | null>(null);
    const lastAngle = useRef<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const layersRef = useRef<LayerWithEditorState[]>([]);

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

    useEffect(() => {
        // 1. JSON Slow-Path (Hydration and Setup ONLY. Playback has been stripped out!)
        const unsubscribeJSON = engine.subscribeToJson((data) => {
            if (data.type === 'hydrate') {
                setLayers(data.layers);
                if (data.layers.length > 0) {
                    nextId.current = Math.max(...data.layers.map((l) => l.numericId)) + 5;
                    nextZIndex.current = Math.max(...data.layers.map((l) => l.config.zIndex)) + 5;
                }
            } else if (data.type === 'upsert_layer') {
                const { layer } = data;
                const newLayerId = layer.numericId;
                if (newLayerId > nextId.current) nextId.current = newLayerId + 5;
                // Multiple editor may interfere we build 5 degree tolerance
                if (!layers.find((l) => l.numericId === layer.numericId)) {
                    nextZIndex.current =
                        (layer.config.zIndex ?? 0) > nextZIndex.current
                            ? layer.config.zIndex + 5
                            : nextZIndex.current + 5;
                }
                setLayers((prev) => {
                    const filtered = prev.filter((l) => l.numericId !== layer.numericId);
                    return [...filtered, layer];
                });
            } else if (data.type === 'processing_progress') {
                setLayers((prev) =>
                    prev.map((l) =>
                        l.numericId === data.numericId ? { ...l, progress: data.progress } : l
                    )
                );
            }
        });

        // 2. Binary Fast-Path
        const unsubscribeBinary = engine.subscribeToBinary(
            (id, cx, cy, width, height, scaleX, scaleY, rotation) => {
                if (trRef.current) {
                    const stage = trRef.current.getStage();
                    const node = stage?.findOne(`#${id}`);

                    if (node && !node.isDragging() && !isPinching) {
                        node.x(cx);
                        node.y(cy);
                        node.width(width);
                        node.height(height);
                        node.scaleX(scaleX);
                        node.scaleY(scaleY);
                        node.rotation(rotation);
                        if (selectedId === id.toString()) trRef.current.forceUpdate();
                        node.getLayer()?.batchDraw();
                    }

                    // When React naturally re-renders later (like when you click the video),
                    // it will read these perfectly accurate coordinates instead of stale ones.
                    const shadowLayer = layersRef.current.find((l) => l.numericId === id);
                    if (shadowLayer) {
                        shadowLayer.config.cx = cx;
                        shadowLayer.config.cy = cy;
                        shadowLayer.config.width = width;
                        shadowLayer.config.height = height;
                        shadowLayer.config.scaleX = scaleX;
                        shadowLayer.config.scaleY = scaleY;
                        shadowLayer.config.rotation = rotation;
                    }
                }
            }
        );

        return () => {
            unsubscribeJSON();
            unsubscribeBinary();
        };
    }, [selectedId, isPinching]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!selectedId) return;
            if (e.key === 'Delete') {
                engine.sendJSON({ type: 'delete_layer', numericId: parseInt(selectedId) });
                setLayers((prev) => prev.filter((l) => l.numericId !== parseInt(selectedId)));
                setSelectedId(null);
            }
            // if (!shouldCenterTransform && e.ctrlKey) {
            //     setShadowShape(layers.find((l) => l.numericId === parseInt(selectedId)) || null);
            //     setShouldCenterTransform(true);
            // }
            // console.log('handleKeyDown', e.shiftKey, shouldMaintainAspectRatio);
            // if (e.shiftKey) if (shouldMaintainAspectRatio) setShouldMaintainAspectRatio(false);
        };
        // const handleKeyUp = (e: KeyboardEvent) => {
        //     e.preventDefault();
        //     if (!selectedId) return;
        //     if (shouldCenterTransform) {
        //         setShouldCenterTransform(false);
        //         const layerToReset = layers.find((l) => l.numericId === parseInt(selectedId));
        //         if (!layerToReset || !shadowShape) return;
        //         layerToReset.config.cx = shadowShape.config.cx;
        //         layerToReset.config.cy = shadowShape.config.cy;
        //         setLayers((prev) =>
        //             prev.map((l) => (l.numericId === parseInt(selectedId) ? layerToReset : l))
        //         );
        //     }
        //     console.log('handleKeyUp', e.shiftKey, shouldMaintainAspectRatio);
        //     if (!shouldMaintainAspectRatio) setShouldMaintainAspectRatio(true);
        // };
        window.addEventListener('keydown', handleKeyDown);
        // window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            // window.removeEventListener('keyup', handleKeyUp);
        };
    }, [
        engine,
        layers,
        setLayers,
        selectedId,
        setShadowShape,
        setShouldCenterTransform,
        setShouldMaintainAspectRatio,
        shouldCenterTransform,
        shouldMaintainAspectRatio
    ]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isImage = file.type.startsWith('image/');
        const localUrl = URL.createObjectURL(file); // Native instant preview Blob

        let mediaWidth = 800;
        let mediaHeight = 600;
        let duration = 0;
        let previewDataUrl = localUrl;

        // 1. Instantly read the dimensions and extract a poster frame locally!
        if (isImage) {
            const img = new window.Image();
            const p = new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve; // Failsafe against corrupt files
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

            // Seek into the video to grab an interesting frame
            tempVid.currentTime = Math.min(0.5, duration / 2);

            // THE FIX 2: Wait for the seek to finish, then wait two animation frames
            // to absolutely guarantee the hardware decoder has painted the pixels to the buffer.
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

            // Cleanup the blob memory
            tempVid.removeAttribute('src');
            tempVid.load();
        }

        const positions = {
            cx: mediaWidth / 2,
            cy: mediaHeight / 2,
            width: mediaWidth,
            height: mediaHeight,
            rotation: 0,
            scaleX: 1,
            scaleY: 1
            // scaleX: Math.min(1, 640 / mediaWidth),
            // scaleY: Math.min(1, 640 / mediaHeight)
        };

        const config: Layer['config'] = { ...positions, zIndex: nextZIndex.current++ };

        const defaultPlayback: Extract<Layer, { type: 'video' }>['playback'] = {
            status: 'paused',
            anchorMediaTime: 0,
            anchorServerTime: engine.getServerTime()
        };

        // 2. OPTIMISTIC UPDATE: Mount it immediately to the local UI!
        const numericId = nextId.current++;
        const optimisticLayer: LayerWithEditorState = {
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
        };

        // We push to our layers ref object because the setLayers migh not have been called by the time it is called a second time.
        layersRef.current.push(optimisticLayer);
        setLayers((prev) => {
            if (prev.find((l) => l.numericId === optimisticLayer.numericId))
                return prev.map((l) => (l.numericId === numericId ? optimisticLayer : l));
            return [...prev, optimisticLayer];
        });
        setSelectedId(numericId.toString());

        // 3. Fire the heavy background network request
        const formData = new FormData();
        formData.append('asset', file);
        formData.append('numericId', numericId.toString());
        formData.append('duration', duration.toString());

        try {
            const res = await fetch(`/upload`, { method: `POST`, body: formData });
            if (!res.ok) throw new Error('Upload failed');
            const data = await res.json();

            // The fetch took time. The user probably moved the preview.
            // Grab the absolute freshest config from our Shadow State mirror!
            const freshestLayer =
                layersRef.current.find((l) => l.numericId === numericId) || optimisticLayer;

            // 4. Lock it in with the preserved transformations.
            const finalizedLayer = { ...freshestLayer, url: data.url, isUploading: false };

            setLayers((prev) => {
                return prev.map((l) => (l.numericId === numericId ? finalizedLayer : l));
            });
            engine.setPlayback(numericId, defaultPlayback);

            engine.sendJSON({
                type: 'upsert_layer',
                origin: 'handleUpload',
                layer: {
                    numericId,
                    type: finalizedLayer.type,
                    playback: defaultPlayback,
                    url: data.url,
                    config: freshestLayer.config
                } as LayerWithEditorState
            });
            URL.revokeObjectURL(localUrl);
        } catch (err) {
            console.error(' Upload failure', err);
            setLayers((prev) => prev.filter((l) => l.numericId !== numericId)); // Rollback
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleAddMap = async () => {
        const numericId = nextId.current++;
        const positionState = {
            cx: 400,
            cy: 300,
            width: 300,
            height: 200,
            rotation: 0,
            scaleX: 1,
            scaleY: 1
        };
        const config: Layer['config'] = { ...positionState, zIndex: nextZIndex.current++ };

        const newLayer: Layer = {
            numericId,
            type: 'map',
            config,
            view: { latitude: 37.7751, longitude: -122.4193, zoom: 11, bearing: 0, pitch: 0 }
        };

        setLayers((prev) => [...prev, newLayer]);
        setSelectedId(numericId.toString());

        engine.sendJSON({ type: 'upsert_layer', origin: 'handleAddGraph', layer: newLayer });
    };

    const handleAddGraph = async () => {
        const canvasEl = document.getElementById('roy-force-graph-host') as HTMLCanvasElement;
        const { width, height } = canvasEl;

        const numericId = nextId.current++;
        const positionState = {
            cx: 400,
            cy: 300,
            width,
            height,
            rotation: 0,
            scaleX: 1,
            scaleY: 1
        };
        const config: Layer['config'] = { ...positionState, zIndex: nextZIndex.current++ };

        const newLayer: Layer = { numericId, type: 'graph', config };

        setLayers((prev) => [...prev, newLayer]);
        setSelectedId(numericId.toString());

        engine.sendJSON({ type: 'upsert_layer', origin: 'handleAddGraph', layer: newLayer });
    };

    const handleAddText = async () => {
        const initialText = '# Hello Wall\nEdit this text!';
        // const { url, w, h } = (await renderTextToSVG(initialText)) ?? {};
        // if (!url) return;

        const numericId = nextId.current++;
        const positionState = {
            cx: 400,
            cy: 300,
            width: 100,
            height: 100,
            rotation: 0,
            scaleX: 1,
            scaleY: 1
        };
        const config: Layer['config'] = { ...positionState, zIndex: nextZIndex.current++ };

        const newLayer: Extract<Layer, { type: 'text' }> = {
            numericId,
            type: 'text',
            config,
            markdown: initialText
        };

        setLayers((prev) => [...prev, newLayer]);
        setSelectedId(numericId.toString());

        engine.sendJSON({ type: 'upsert_layer', origin: 'handleAddText', layer: newLayer });
    };

    const handleBringToFront = useCallback(() => {
        if (!selectedId) return;
        const numericId = parseInt(selectedId);
        const layerToUpdate = layers.find((l) => l.numericId === numericId);
        if (!layerToUpdate) return;

        const updatedConfig = {
            ...layerToUpdate.config,
            zIndex:
                layerToUpdate.config.zIndex === nextZIndex.current
                    ? layerToUpdate.config.zIndex
                    : nextZIndex.current++
        };
        setLayers((prev) =>
            prev.map((l) => (l.numericId === numericId ? { ...l, config: updatedConfig } : l))
        );

        if (layerToUpdate.type === 'video')
            engine.sendJSON({
                type: 'upsert_layer',
                origin: 'handleBringToFront',
                layer: {
                    ...layerToUpdate,
                    config: updatedConfig,
                    playback: engine.getPlayback(numericId) || layerToUpdate.playback
                }
            });
        else
            engine.sendJSON({
                type: 'upsert_layer',
                origin: 'handleBringToFront',
                layer: { ...layerToUpdate, config: updatedConfig }
            });
    }, [layers, selectedId]);

    const handleStageInteractionStart = (e: KonvaEventObject<TouchEvent | MouseEvent>) => {
        if (
            (e.evt instanceof TouchEvent && e.evt.touches?.length === 1) ||
            e.type === 'mousedown'
        ) {
            const clickedOnEmpty = e.target === e.target.getStage();
            if (clickedOnEmpty && selectedId) {
                flushNodeState(selectedId);
                setSelectedId(null);
            }
        }
        if (e.evt instanceof TouchEvent && e.evt.touches?.length === 2 && selectedId) {
            flushNodeState(selectedId);
            setIsPinching(true);
            const t1 = e.evt.touches[0];
            const t2 = e.evt.touches[1];
            const p1 = { x: t1.clientX, y: t1.clientY };
            const p2 = { x: t2.clientX, y: t2.clientY };
            lastDist.current = getDistance(p1, p2);
            lastAngle.current = getAngle(p1, p2);
            lastCenter.current = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        }
    };

    const handleTouchMove = (e: KonvaEventObject<TouchEvent>) => {
        e.evt.preventDefault();
        if (e.evt.touches.length === 2 && selectedId && trRef.current) {
            const stage = trRef.current.getStage();
            const node = stage?.findOne(`#${selectedId}`);
            if (!node) return;
            if (node.isDragging()) node.stopDrag();

            const t1 = e.evt.touches[0];
            const t2 = e.evt.touches[1];
            const p1 = { x: t1.clientX, y: t1.clientY };
            const p2 = { x: t2.clientX, y: t2.clientY };
            const dist = getDistance(p1, p2);
            const angle = getAngle(p1, p2);
            const screenCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

            if (!lastDist.current || !lastAngle.current || !lastCenter.current) return;

            const stageScaleX = stage?.scaleX();
            const stageScaleY = stage?.scaleY();
            const scaleBy = dist / lastDist.current;
            const angleDelta = angle - lastAngle.current;

            if (!stageScaleX || !stageScaleY) return;

            const dx = (screenCenter.x - lastCenter.current.x) / stageScaleX;
            const dy = (screenCenter.y - lastCenter.current.y) / stageScaleY;
            let newX = Math.round(node.x() + dx);
            let newY = Math.round(node.y() + dy);

            const logicalPinchCenterX = screenCenter.x / stageScaleX;
            const logicalPinchCenterY = screenCenter.y / stageScaleY;
            newX -= Math.round((logicalPinchCenterX - newX) * (scaleBy - 1));
            newY -= Math.round((logicalPinchCenterY - newY) * (scaleBy - 1));

            const newScaleX = Math.round(node.scaleX() * scaleBy * 1000) / 1000;
            const newScaleY = Math.round(node.scaleY() * scaleBy * 1000) / 1000;
            if (newScaleX > 0.1 && newScaleX < 10) {
                node.scaleX(newScaleX);
                node.x(newX);
            }
            if (newScaleY > 0.1 && newScaleY < 10) {
                node.scaleY(newScaleY);
                node.y(newY);
            }
            node.rotation(node.rotation() + angleDelta);
            trRef.current.getLayer()?.batchDraw();
            engine.broadcastBinaryMove(
                parseInt(selectedId),
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
            lastCenter.current = screenCenter;
        }
    };

    const handleTouchEnd = (e: KonvaEventObject<TouchEvent>) => {
        if (e.evt.touches.length < 2) setIsPinching(false);
        if (selectedId && trRef.current) {
            const stage = trRef.current.getStage();
            const node = stage?.findOne<Konva.Shape>(`#${selectedId}`);
            if (node) handleTransformEnd({ target: node }, parseInt(selectedId));
        }
        lastDist.current = null;
        lastAngle.current = null;
        lastCenter.current = null;
    };

    const handleTransform = (e: Pick<KonvaEventObject<Event>, 'target'>, numericId: number) => {
        const node = e.target as Konva.Shape;
        const layer = layers.find((l) => l.numericId === numericId);
        if (!node || !layer) return;

        // We need to tweak types for which scale baking makes sense. Perhaps make it customisable later
        if (layer.type === 'image' || layer.type === 'map') {
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();

            // if (scaleX !== 1 || scaleY !== 1) {
            // Save absolute transform BEFORE baking
            const oldAbsTransform = node.getAbsoluteTransform().copy();

            // Absolute world position of local origin (0,0)
            const originWorld = oldAbsTransform.point({ x: 0, y: 0 });

            // Bake size const newWidth = rect.width() * scaleX;
            const newWidth = node.width() * scaleX;
            const newHeight = node.height() * scaleY;
            node.width(newWidth);
            node.height(newHeight);
            node.scale({ x: 1, y: 1 });
            node.offsetX(newWidth / 2);
            node.offsetY(newHeight / 2);

            // Compute new absolute transform
            const newAbsTransform = node.getAbsoluteTransform().copy();
            const newOriginWorld = newAbsTransform.point({ x: 0, y: 0 });

            // Compute world delta
            const dx = originWorld.x - newOriginWorld.x;
            const dy = originWorld.y - newOriginWorld.y;

            // Apply correction in parent space
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
        (e: Pick<KonvaEventObject<Event>, 'target'>, numericId: number) => {
            const node = e.target;

            // Must use layersRef to prevent the component from saving old state when dragged
            const layerToUpdate = layersRef.current.find((l) => l.numericId === numericId);
            if (!layerToUpdate) return;

            const updatedConfig: Layer['config'] = {
                ...layerToUpdate.config,
                cx: Math.round(node.x()),
                cy: Math.round(node.y()),
                width: Math.round(node.width()),
                height: Math.round(node.height()),
                scaleX: Math.round(node.scaleX() * 1000) / 1000,
                scaleY: Math.round(node.scaleY() * 1000) / 1000,
                rotation: Math.round(node.rotation())
            };

            layerToUpdate.config = updatedConfig;

            setSelectedId(numericId.toString());

            if (layerToUpdate.type === 'video') {
                // Extract actual playback state so moving video doesn't accidentally rewind it for Wall screens
                const truePlayback = engine.getPlayback(numericId) || layerToUpdate.playback;

                setLayers((prev) =>
                    prev.map((l) =>
                        l.numericId === numericId ? { ...l, config: updatedConfig } : l
                    )
                );

                engine.sendJSON({
                    type: 'upsert_layer',
                    origin: 'handleTransformEnd',
                    layer: { ...layerToUpdate, config: updatedConfig, playback: truePlayback }
                });
            } else {
                setLayers((prev) =>
                    prev.map((l) =>
                        l.numericId === numericId ? { ...l, config: updatedConfig } : l
                    )
                );

                engine.sendJSON({
                    type: 'upsert_layer',
                    origin: 'handleTransformEnd',
                    layer: { ...layerToUpdate, config: updatedConfig }
                });
            }
        },
        []
    );

    const flushNodeState = (idToFlush: string) => {
        if (!trRef.current) return;
        const stage = trRef.current.getStage();
        const node = stage?.findOne<Konva.Shape>(`#${idToFlush}`);
        if (node) handleTransformEnd({ target: node }, parseInt(idToFlush));
    };

    useEffect(() => {
        if (selectedId && trRef.current) {
            const node = trRef.current.getStage()?.findOne(`#${selectedId}`);
            if (node) {
                trRef.current.nodes([node]);
                trRef.current.getLayer()?.batchDraw();
            }
        } else if (trRef.current) {
            trRef.current.nodes([]);
            trRef.current.getLayer()?.batchDraw();
        }
    }, [selectedId]);

    return (
        <>
            <div className="h-fit overflow-auto bg-black">
                <Stage
                    width={COLS * SCREEN_W * STAGE_SCALE_FACTOR}
                    height={ROWS * SCREEN_H * STAGE_SCALE_FACTOR}
                    // width={window.innerWidth}
                    // height={window.innerHeight}
                    onMouseDown={handleStageInteractionStart}
                    onTouchStart={handleStageInteractionStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    scaleX={STAGE_SCALE_FACTOR}
                    scaleY={STAGE_SCALE_FACTOR}
                >
                    <KonvaLayer>
                        {Array.from({ length: COLS * ROWS }).map((_, i) => {
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
                        })}

                        {[...layers]
                            .sort((a, b) => a.config.zIndex - b.config.zIndex)
                            .map((layer) => {
                                const props = {
                                    isPinching,
                                    onSelect: () => setSelectedId(layer.numericId.toString()),
                                    onTransform: (e: KonvaEventObject<Event>) =>
                                        handleTransform(e, layer.numericId),
                                    onTransformEnd: (e: KonvaEventObject<Event>) =>
                                        handleTransformEnd(e, layer.numericId)
                                };

                                // Route images and uploading previews to the Static element
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
                                        <Rect
                                            key={`txt_${layer.numericId}`}
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
                                return null;
                            })}

                        <Transformer
                            ref={trRef}
                            flipEnabled={false}
                            anchorCornerRadius={10}
                            anchorSize={20}
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
            <div className="flex p-4">
                <div className="flex flex-col gap-2">
                    <div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="video/mp4, image/*"
                            onChange={handleUpload}
                            className="cursor-pointer opacity-50 content-none"
                        />
                    </div>
                    <div className="flex gap-4 text-blue-400">
                        <button
                            onClick={() => {
                                handleAddText();
                            }}
                            className="cursor-pointer"
                        >
                            Add Text
                        </button>
                        <button
                            onClick={() => {
                                handleAddMap();
                            }}
                            className="cursor-pointer"
                        >
                            Add Map
                        </button>
                        {/* <button
                            onClick={() => {
                                handleAddGraph();
                            }}
                            className="cursor-pointer"
                        >
                            Add Roy Graph
                        </button> */}
                    </div>
                    <div className="flex gap-4 text-blue-400">
                        <button
                            onClick={() => {
                                engine.sendJSON({ type: 'clear_stage' });
                                setSelectedId(null);
                            }}
                            className="cursor-pointer font-bold text-red-700"
                        >
                            Reset Stage
                        </button>
                        <button
                            onClick={() => {
                                engine.sendJSON({ type: 'reboot' });
                                setSelectedId(null);
                            }}
                            className="cursor-pointer font-bold text-red-700"
                        >
                            Refresh
                        </button>
                    </div>
                </div>
                {selectedId &&
                    (() => {
                        const activeLayer = layers.find(
                            (l) => l.numericId === parseInt(selectedId)
                        );
                        if (!activeLayer) return null;
                        const isVideo = activeLayer.type === 'video';
                        const isText = activeLayer.type === 'text';
                        return (
                            <>
                                <div
                                    style={{
                                        borderLeft: '1px solid #ccc',
                                        height: '24px',
                                        margin: '0 10px'
                                    }}
                                ></div>
                                <button onClick={handleBringToFront}>Bring to Front</button>
                                {isVideo && (
                                    <>
                                        <div
                                            style={{
                                                borderLeft: '1px solid #ccc',
                                                height: '24px',
                                                margin: '0 10px'
                                            }}
                                        ></div>
                                        <PlaybackControls
                                            key={`pc_${activeLayer.numericId}`}
                                            layer={activeLayer}
                                            engine={engine}
                                        />

                                        <div
                                            style={{
                                                borderLeft: '1px solid #ccc',
                                                height: '24px',
                                                margin: '0 10px'
                                            }}
                                        ></div>
                                        <VideoScrubber
                                            key={`vs_${activeLayer.numericId}`}
                                            layer={activeLayer}
                                            engine={engine}
                                        />
                                    </>
                                )}

                                {isText && (
                                    <>
                                        <div
                                            style={{
                                                borderLeft: '1px solid #ccc',
                                                height: '24px',
                                                margin: '0 10px'
                                            }}
                                        ></div>
                                        <TextEditor
                                            key={`te_${activeLayer.numericId}`}
                                            layer={activeLayer}
                                            engine={engine}
                                        />
                                    </>
                                )}
                            </>
                        );
                    })()}
            </div>
        </>
    );
}

// --- VITE HMR DEFENSE STRATEGY ---
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        window.__EDITOR_RELOADING__ = true;
    });
}
