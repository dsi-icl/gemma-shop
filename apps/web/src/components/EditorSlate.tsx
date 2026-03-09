import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer as KonvaLayer, Transformer, Group, Text, Rect } from 'react-konva';

import { KonvaStaticImage } from '~/components/KonvaStaticImage';
import { KonvaVideo } from '~/components/KonvaVideo';
import { RoyStaticRenderer } from '~/components/roygraph/RoyStaticRenderer';
import { Toolbar } from '~/components/Toolbar';
import { EditorEngine } from '~/lib/editorEngine';
import { useEditorStore } from '~/lib/editorStore';
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
    // ── Store state (replaces useState + useRef counters) ─────────────────
    const layers = useEditorStore((s) => s.layers);
    const selectedId = useEditorStore((s) => s.selectedId);
    const select = useEditorStore((s) => s.select);

    // ── Local-only state (Konva interaction, not shared) ──────────────────
    const [isPinching, setIsPinching] = useState(false);

    const trRef = useRef<Konva.Transformer>(null);
    const lastCenter = useRef<{ x: number; y: number } | null>(null);
    const lastDist = useRef<number | null>(null);
    const lastAngle = useRef<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Shadow ref — keeps binary-updated positions for the fast-path.
    // Binary updates mutate this directly (no React re-render).
    const layersRef = useRef<LayerWithEditorState[]>([]);
    useEffect(() => {
        layersRef.current = layers;
    }, [layers]);

    // ── HMR rehydration ───────────────────────────────────────────────────
    useEffect(() => {
        if (window.__EDITOR_RELOADING__) {
            setTimeout(() => {
                engine.sendJSON({ type: 'rehydrate_please' });
            }, 500);
            window.__EDITOR_RELOADING__ = false;
        }
    }, []);

    // ── Binary fast-path subscription ─────────────────────────────────────
    // JSON messages are handled by the store wiring in editorStore.ts.
    // Only the binary path stays here because it directly manipulates Konva nodes.
    useEffect(() => {
        const unsubscribeBinary = engine.subscribeToBinary(
            (id, cx, cy, width, height, scaleX, scaleY, rotation) => {
                if (trRef.current) {
                    const stage = trRef.current.getStage();
                    const node = stage?.findOne(`#${id}`);
                    const currentSelectedId = useEditorStore.getState().selectedId;

                    if (node && !node.isDragging() && !isPinching) {
                        node.x(cx);
                        node.y(cy);
                        node.width(width);
                        node.height(height);
                        node.scaleX(scaleX);
                        node.scaleY(scaleY);
                        node.rotation(rotation);
                        if (currentSelectedId === id.toString()) trRef.current.forceUpdate();
                        node.getLayer()?.batchDraw();
                    }

                    // Shadow state — so React reads accurate coords on next render
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

        return () => unsubscribeBinary();
    }, [isPinching]);

    // ── Keyboard shortcut ─────────────────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!useEditorStore.getState().selectedId) return;
            if (e.key === 'Delete') useEditorStore.getState().deleteSelectedLayer();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

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

        const positions = {
            cx: mediaWidth / 2,
            cy: mediaHeight / 2,
            width: mediaWidth,
            height: mediaHeight,
            rotation: 0,
            scaleX: 1,
            scaleY: 1
        };

        const config: Layer['config'] = { ...positions, zIndex };

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
        store.select(numericId.toString());

        // 3. Background network upload
        const formData = new FormData();
        formData.append('asset', file);
        formData.append('numericId', numericId.toString());
        formData.append('duration', duration.toString());

        try {
            const res = await fetch(`/upload`, { method: `POST`, body: formData });
            if (!res.ok) throw new Error('Upload failed');
            const data = await res.json();

            // Grab freshest config from shadow state (user may have moved the preview)
            const freshestLayer =
                layersRef.current.find((l) => l.numericId === numericId) || optimisticLayer;

            // 4. Lock it in with preserved transformations
            const finalizedLayer = { ...freshestLayer, url: data.url, isUploading: false };

            useEditorStore.getState().upsertLayer(finalizedLayer);
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
            useEditorStore.getState().removeLayer(numericId);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // ── Konva transform handlers ──────────────────────────────────────────

    const handleTransform = (e: Pick<KonvaEventObject<Event>, 'target'>, numericId: number) => {
        const node = e.target as Konva.Shape;
        const layer = layersRef.current.find((l) => l.numericId === numericId);
        if (!node || !layer) return;

        // Scale baking for image/map layers
        if (layer.type === 'image' || layer.type === 'map') {
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
        (e: Pick<KonvaEventObject<Event>, 'target'>, numericId: number) => {
            const node = e.target;

            // Must use layersRef — has binary-updated positions
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

            // Shadow mutation for binary fast-path
            layerToUpdate.config = updatedConfig;

            const store = useEditorStore.getState();
            store.select(numericId.toString());
            store.updateLayerConfig(numericId, updatedConfig);

            // Sync to server
            if (layerToUpdate.type === 'video') {
                const truePlayback = engine.getPlayback(numericId) || layerToUpdate.playback;
                engine.sendJSON({
                    type: 'upsert_layer',
                    origin: 'handleTransformEnd',
                    layer: { ...layerToUpdate, config: updatedConfig, playback: truePlayback }
                });
            } else {
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

    // ── Stage interaction handlers ────────────────────────────────────────

    const handleStageInteractionStart = (e: KonvaEventObject<TouchEvent | MouseEvent>) => {
        const currentSelectedId = useEditorStore.getState().selectedId;
        if (
            (e.evt instanceof TouchEvent && e.evt.touches?.length === 1) ||
            e.type === 'mousedown'
        ) {
            const clickedOnEmpty = e.target === e.target.getStage();
            if (clickedOnEmpty && currentSelectedId) {
                flushNodeState(currentSelectedId);
                select(null);
            }
        }
        if (e.evt instanceof TouchEvent && e.evt.touches?.length === 2 && currentSelectedId) {
            flushNodeState(currentSelectedId);
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
        const currentSelectedId = useEditorStore.getState().selectedId;
        if (e.evt.touches.length === 2 && currentSelectedId && trRef.current) {
            const stage = trRef.current.getStage();
            const node = stage?.findOne(`#${currentSelectedId}`);
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
                parseInt(currentSelectedId),
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
        const currentSelectedId = useEditorStore.getState().selectedId;
        if (currentSelectedId && trRef.current) {
            const stage = trRef.current.getStage();
            const node = stage?.findOne<Konva.Shape>(`#${currentSelectedId}`);
            if (node) handleTransformEnd({ target: node }, parseInt(currentSelectedId));
        }
        lastDist.current = null;
        lastAngle.current = null;
        lastCenter.current = null;
    };

    // ── Transformer selection sync ────────────────────────────────────────
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

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <>
            <div id="slate" className="h-fit overflow-auto bg-black">
                <Stage
                    width={COLS * SCREEN_W * STAGE_SCALE_FACTOR}
                    height={ROWS * SCREEN_H * STAGE_SCALE_FACTOR}
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
                                    onSelect: () => select(layer.numericId.toString()),
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
            <Toolbar fileInputRef={fileInputRef} onUpload={handleUpload} />
        </>
    );
}

// --- VITE HMR DEFENSE STRATEGY ---
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        window.__EDITOR_RELOADING__ = true;
    });
}
