'use client';

import { createFileRoute } from '@tanstack/react-router';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { compiler } from 'markdown-to-jsx/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Transformer, Group, Text, Rect } from 'react-konva';
import satori from 'satori';

import { RoyForceGraph } from '@/components/roygraph/RoyForceGraph';

import { EditorEngine } from '../lib/editorEngine';

const engine = EditorEngine.getInstance();

const SCREEN_W = 1920;
const SCREEN_H = 1080;
const COLS = 16;
const ROWS = 4;

const cachedFont: Map<string, ArrayBuffer> = new Map();

export const Route = createFileRoute('/editor')({ component: EditorApp });

async function getFont(file: string) {
    const storedFont = cachedFont.get(file);
    if (storedFont) return storedFont;
    const res = await fetch(`/fonts/${file}`);
    const fontData = await res.arrayBuffer();
    cachedFont.set(file, fontData);
    return fontData;
}

async function renderTextToSVG(
    markdown: string
): Promise<{ url: string; w: number; h: number } | null> {
    try {
        const renderedJSX = compiler(markdown, {
            forceWrapper: true,
            wrapper: 'div',
            wrapperProps: {
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    color: 'green',
                    fontFamily: 'Lato'
                }
            } as any
        });

        const svg = await satori(renderedJSX, {
            width: 600,
            height: 400,
            fonts: [
                {
                    name: 'Lato',
                    data: await getFont('Lato-Regular.ttf'),
                    weight: 400,
                    style: 'normal'
                },
                {
                    name: 'Lato',
                    data: await getFont('Lato-Italic.ttf'),
                    weight: 400,
                    style: 'italic'
                }
            ]
        });

        // 3. Extract the dynamic height Satori calculated from the viewBox
        const heightMatch = svg.match(/height="(\d+)"/);
        const calculatedHeight = heightMatch ? parseInt(heightMatch[1]) : 200;

        // 4. Encode as a clean data URL (faster and safer than Blobs for rapid typing)
        const encodedSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        // const encodedPng = `data:image/png;base64,${Buffer.from(pngBuffer).toString('base64')}`;

        return { url: encodedSvg, w: 800, h: calculatedHeight };
    } catch (err) {
        console.error('Error rendering text to SVG:', err);
    }
    return null;
}

function getDistance(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

function getAngle(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    return (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
}

function EditorApp() {
    const [layers, setLayers] = useState<any[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isPinching, setIsPinching] = useState(false);

    const nextId = useRef(1);
    const nextZIndex = useRef(10);
    const trRef = useRef<any>(null);
    const lastCenter = useRef<{ x: number; y: number } | null>(null);
    const lastDist = useRef<number | null>(null);
    const lastAngle = useRef<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const layersRef = useRef<any[]>([]);

    useEffect(() => {
        layersRef.current = layers;
    }, [layers]);

    useEffect(() => {
        // 1. JSON Slow-Path (Hydration and Setup ONLY. Playback has been stripped out!)
        const unsubscribeJSON = engine.subscribeToJson((data) => {
            if (data.type === 'hydrate') {
                setLayers(data.layers);
                if (data.layers.length > 0) {
                    nextId.current = Math.max(...data.layers.map((l: any) => l.numericId)) + 5;
                    nextZIndex.current =
                        Math.max(...data.layers.map((l: any) => l.config.zIndex)) + 5;
                }
            } else if (data.type === 'upsert_layer') {
                const newLayerId = parseInt(data.numericId);
                if (newLayerId > nextId.current) nextId.current = newLayerId + 5;
                // Multiple editor may interfere we build 5 degree tolerance
                if (!layers.find((l) => l.numericId === data.numericId)) {
                    nextZIndex.current =
                        (data.config.zIndex ?? 0) > nextZIndex.current
                            ? data.config.zIndex + 5
                            : nextZIndex.current + 5;
                }
                setLayers((prev) => {
                    const filtered = prev.filter((l) => l.numericId !== data.numericId);
                    return [...filtered, data];
                });
            } else if (data.type === 'upload_progress') {
                setLayers((prev) =>
                    prev.map((l) =>
                        l.numericId === data.numericId ? { ...l, progress: data.progress } : l
                    )
                );
            }
        });

        // 2. Binary Fast-Path
        const unsubscribeBinary = engine.subscribeToBinary((id, cx, cy, scale, rotation) => {
            if (trRef.current) {
                const stage = trRef.current.getStage();
                const node = stage.findOne(`#${id}`);

                if (node && !node.isDragging() && !isPinching) {
                    node.x(cx);
                    node.y(cy);
                    node.scaleX(scale);
                    node.scaleY(scale);
                    node.rotation(rotation);
                    if (selectedId === id.toString()) trRef.current.forceUpdate();
                    node.getLayer().batchDraw();
                }

                // When React naturally re-renders later (like when you click the video),
                // it will read these perfectly accurate coordinates instead of stale ones.
                const shadowLayer = layersRef.current.find((l) => l.numericId === id);
                if (shadowLayer) {
                    shadowLayer.config.cx = cx;
                    shadowLayer.config.cy = cy;
                    shadowLayer.config.scale = scale;
                    shadowLayer.config.rotation = rotation;
                }
            }
        });

        return () => {
            unsubscribeJSON();
            unsubscribeBinary();
        };
    }, [selectedId, isPinching]);

    useEffect(() => {
        const deleteLayer = () => {
            if (selectedId) {
                engine.sendJSON({ type: 'delete_layer', numericId: parseInt(selectedId) });
                setLayers((prev) => prev.filter((l) => l.numericId !== parseInt(selectedId)));
                setSelectedId(null);
            }
        };
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Delete') deleteLayer();
        });
        return () => {
            window.removeEventListener('keydown', deleteLayer);
        };
    }, [selectedId]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isImage = file.type.startsWith('image/');
        const numericId = nextId.current++;
        const localUrl = URL.createObjectURL(file); // Native instant preview Blob

        let mediaWidth = 800,
            mediaHeight = 600,
            duration = 0;
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
            mediaWidth = img.width || 800;
            mediaHeight = img.height || 600;
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
            mediaWidth = tempVid.videoWidth || 800;
            mediaHeight = tempVid.videoHeight || 600;
            duration = tempVid.duration || 0.1;

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

        const config = {
            cx: 400,
            cy: 300,
            w: mediaWidth,
            h: mediaHeight,
            rotation: 0,
            duration: duration,
            scale: Math.min(1, 640 / mediaWidth),
            zIndex: nextZIndex.current++,
            loop: true
        };

        const defaultPlayback = {
            status: 'paused',
            anchorMediaTime: 0,
            anchorServerTime: engine.getServerTime()
        };

        // 2. OPTIMISTIC UPDATE: Mount it immediately to the local UI!
        const optimisticLayer = {
            numericId,
            layerType: isImage ? 'image' : 'video',
            url: previewDataUrl,
            playback: defaultPlayback,
            config,
            isUploading: true,
            progress: 0
        };
        setLayers((prev) => [...prev, optimisticLayer]);
        setSelectedId(numericId.toString());

        // 3. Fire the heavy background network request
        const formData = new FormData();
        formData.append('asset', file);
        formData.append('numericId', numericId.toString());
        formData.append('duration', duration.toString());

        try {
            const res = await fetch(`/upload`, { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Upload failed');
            const data = await res.json();

            // The fetch took time. The user probably moved the preview.
            // Grab the absolute freshest config from our Shadow State mirror!
            const freshestLayer =
                layersRef.current.find((l) => l.numericId === numericId) || optimisticLayer;

            // 4. Lock it in with the preserved transformations.
            const finalizedLayer = { ...freshestLayer, url: data.url, isUploading: false };

            setLayers((prev) => prev.map((l) => (l.numericId === numericId ? finalizedLayer : l)));
            engine.setPlayback(numericId, defaultPlayback);

            engine.sendJSON({
                type: 'upsert_layer',
                origin: 'handleUpload',
                numericId,
                layerType: finalizedLayer.layerType,
                playback: defaultPlayback,
                url: data.url,
                config: freshestLayer.config
            });
        } catch (err) {
            alert('Upload failed.');
            setLayers((prev) => prev.filter((l) => l.numericId !== numericId)); // Rollback
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleAddGraph = async () => {
        const canvasEl = document.getElementById('roy-force-graph-host') as HTMLCanvasElement;
        const url = canvasEl.toDataURL();
        const w = canvasEl.width;
        const h = canvasEl.height;

        const numericId = nextId.current++;
        const config = {
            cx: 400,
            cy: 300,
            w,
            h,
            rotation: 0,
            scale: 1,
            zIndex: nextZIndex.current++
        };

        const newLayer = {
            numericId,
            layerType: 'graph',
            url,
            config,
            playback: { status: 'paused', anchorMediaTime: 0, anchorServerTime: 0 }
        };

        setLayers((prev) => [...prev, newLayer]);
        setSelectedId(numericId.toString());

        engine.sendJSON({
            type: 'upsert_layer',
            origin: 'handleAddGraph',
            numericId,
            layerType: 'graph',
            url,
            config,
            playback: newLayer.playback
        });
    };

    const handleAddText = async () => {
        const initialText = '# Hello Wall\nEdit this text!';
        const { url, w, h } = (await renderTextToSVG(initialText)) ?? {};
        if (!url) return;

        const numericId = nextId.current++;
        const config = {
            cx: 400,
            cy: 300,
            w,
            h,
            rotation: 0,
            scale: 1,
            zIndex: nextZIndex.current++,
            markdown: initialText
        };

        const newLayer = {
            numericId,
            layerType: 'text',
            url,
            config,
            playback: { status: 'paused', anchorMediaTime: 0, anchorServerTime: 0 }
        };

        setLayers((prev) => [...prev, newLayer]);
        setSelectedId(numericId.toString());

        engine.sendJSON({
            type: 'upsert_layer',
            origin: 'handleAddText',
            numericId,
            layerType: 'text',
            url,
            config,
            playback: newLayer.playback
        });
    };

    const handleBringToFront = useCallback(() => {
        if (!selectedId) return;
        const numericId = parseInt(selectedId);
        const layerToUpdate = layers.find((l) => l.numericId === numericId);
        if (!layerToUpdate) return;

        const updatedConfig = {
            ...layerToUpdate.config,
            zIndex:
                layerToUpdate.config === nextZIndex.current
                    ? layerToUpdate.config
                    : nextZIndex.current++
        };
        setLayers((prev) =>
            prev.map((l) => (l.numericId === numericId ? { ...l, config: updatedConfig } : l))
        );

        engine.sendJSON({
            type: 'upsert_layer',
            origin: 'handleBringToFront',
            numericId: numericId,
            layerType: layerToUpdate.layerType,
            url: layerToUpdate.url,
            config: updatedConfig,
            playback: engine.getPlayback(numericId) || layerToUpdate.playback
        });
    }, [layers, selectedId]);

    const handleStageInteractionStart = (e: KonvaEventObject<any>) => {
        if (e.evt.touches?.length === 1 || e.type === 'mousedown') {
            const clickedOnEmpty = e.target === e.target.getStage();
            if (clickedOnEmpty && selectedId) {
                flushNodeState(selectedId);
                setSelectedId(null);
            }
        }
        if (e.evt.touches?.length === 2 && selectedId) {
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

    const handleTouchMove = (e: any) => {
        e.evt.preventDefault();
        if (e.evt.touches.length === 2 && selectedId && trRef.current) {
            const stage = trRef.current.getStage();
            const node = stage.findOne(`#${selectedId}`);
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

            const stageScale = stage.scaleX();
            const scaleBy = dist / lastDist.current;
            const angleDelta = angle - lastAngle.current;

            const dx = (screenCenter.x - lastCenter.current.x) / stageScale;
            const dy = (screenCenter.y - lastCenter.current.y) / stageScale;
            let newX = node.x() + dx;
            let newY = node.y() + dy;

            const logicalPinchCenterX = screenCenter.x / stageScale;
            const logicalPinchCenterY = screenCenter.y / stageScale;
            newX -= (logicalPinchCenterX - newX) * (scaleBy - 1);
            newY -= (logicalPinchCenterY - newY) * (scaleBy - 1);

            const newScale = node.scaleX() * scaleBy;
            if (newScale > 0.1 && newScale < 10) {
                node.scaleX(newScale);
                node.scaleY(newScale);
                node.x(newX);
                node.y(newY);
            }
            node.rotation(node.rotation() + angleDelta);
            trRef.current.getLayer().batchDraw();
            engine.broadcastBinaryMove(
                parseInt(selectedId),
                node.x(),
                node.y(),
                node.scaleX(),
                node.rotation()
            );

            lastDist.current = dist;
            lastAngle.current = angle;
            lastCenter.current = screenCenter;
        }
    };

    const handleTouchEnd = (e: any) => {
        if (e.evt.touches.length < 2) setIsPinching(false);
        if (selectedId && trRef.current) {
            const stage = trRef.current.getStage();
            const node = stage.findOne(`#${selectedId}`);
            if (node) handleTransformEnd({ target: node }, parseInt(selectedId));
        }
        lastDist.current = null;
        lastAngle.current = null;
        lastCenter.current = null;
    };

    const handleTransform = (e: any, numericId: number) => {
        const node = e.target;
        engine.broadcastBinaryMove(numericId, node.x(), node.y(), node.scaleX(), node.rotation());
    };

    const handleTransformEnd = useCallback((e: any, numericId: number) => {
        const node = e.target;

        // Must use layersRef to prevent the component from saving old state when dragged
        const layerToUpdate = layersRef.current.find((l) => l.numericId === numericId);
        if (!layerToUpdate) return;

        const updatedConfig = {
            ...layerToUpdate.config,
            cx: node.x(),
            cy: node.y(),
            scale: node.scaleX(),
            rotation: node.rotation()
        };

        setLayers((prev) =>
            prev.map((l) => (l.numericId === numericId ? { ...l, config: updatedConfig } : l))
        );

        // Extract actual playback state so moving video doesn't accidentally rewind it for Wall screens
        const truePlayback = engine.getPlayback(numericId) || layerToUpdate.playback;

        engine.sendJSON({
            type: 'upsert_layer',
            origin: 'handleTransformEnd',
            numericId,
            layerType: layerToUpdate.layerType,
            url: layerToUpdate.url,
            config: updatedConfig,
            playback: truePlayback
        });
    }, []);

    const flushNodeState = (idToFlush: string) => {
        if (!trRef.current) return;
        const stage = trRef.current.getStage();
        const node = stage.findOne(`#${idToFlush}`);
        if (node) handleTransformEnd({ target: node }, parseInt(idToFlush));
    };

    useEffect(() => {
        if (selectedId && trRef.current) {
            const node = trRef.current.getStage().findOne(`#${selectedId}`);
            if (node) {
                trRef.current.nodes([node]);
                trRef.current.getLayer().batchDraw();
            }
        } else if (trRef.current) {
            trRef.current.nodes([]);
            trRef.current.getLayer().batchDraw();
        }
    }, [selectedId]);

    return (
        <div style={{ width: '100vw', height: '100vh', margin: 0 }}>
            {/* Dynamic Control Panel */}
            <div
                style={{
                    position: 'fixed',
                    bottom: 10,
                    left: 10,
                    zIndex: 10,
                    background: '#333',
                    color: '#ccc',
                    padding: 15,
                    borderRadius: 8,
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center',
                    scale: 2,
                    transformOrigin: 'left bottom'
                }}
            >
                <div className="flex flex-col gap-2">
                    <div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="video/mp4, image/*"
                            onChange={handleUpload}
                            className="cursor-pointer"
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
                                handleAddGraph();
                            }}
                            className="cursor-pointer"
                        >
                            Add Roy Graph
                        </button>
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
                        const isVideo = activeLayer.layerType === 'video';
                        const isText = activeLayer.layerType === 'text';
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

            <Stage
                width={window.innerWidth}
                height={window.innerHeight}
                onMouseDown={handleStageInteractionStart}
                onTouchStart={handleStageInteractionStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                scaleX={0.25}
                scaleY={0.25}
            >
                <Layer>
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
                        .sort((a, b) => (a.config.zIndex || 0) - (b.config.zIndex || 0))
                        .map((layer) => {
                            const props = {
                                layer,
                                isPinching,
                                onSelect: () => setSelectedId(layer.numericId.toString()),
                                onTransform: (e: any) => handleTransform(e, layer.numericId),
                                onTransformEnd: (e: any) => handleTransformEnd(e, layer.numericId)
                            };

                            // Route images and uploading previews to the Static element
                            if (
                                layer.layerType === 'image' ||
                                layer.layerType === 'text' ||
                                layer.isUploading
                            ) {
                                return (
                                    <KonvaStaticImage key={`spi_${layer.numericId}`} {...props} />
                                );
                            }
                            if (layer.layerType === 'graph') {
                                return (
                                    <RoyStaticRenderer key={`roy_${layer.numericId}`} {...props} />
                                );
                            }
                            return <KonvaVideo key={`vid_${layer.numericId}`} {...props} />;
                        })}

                    <Transformer
                        ref={trRef}
                        keepRatio={true}
                        boundBoxFunc={(oldBox, newBox) => {
                            if (Math.abs(newBox.width) < 50 || Math.abs(newBox.height) < 50)
                                return oldBox;
                            return newBox;
                        }}
                    />
                </Layer>
            </Stage>
            <RoyForceGraph
                style={{
                    display: 'block',
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    visibility: 'hidden'
                }}
            />
        </div>
    );
}

// --- SUB-COMPONENT: Live Video inside Konva ---
function KonvaVideo({ layer, isPinching, onSelect, onTransform, onTransformEnd }: any) {
    const imageRef = useRef<any>(null);
    const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);

    useEffect(() => {
        const vid = document.createElement('video');
        if (!layer.url.startsWith('blob:') && !layer.url.startsWith('data:')) {
            vid.crossOrigin = 'anonymous';
        }
        vid.muted = true;
        vid.preload = 'auto';
        vid.playsInline = true;
        vid.loop = layer.config.loop ?? true;

        // Force a canvas paint the exact millisecond the browser has a frame ready
        vid.addEventListener('canplay', () => {
            imageRef.current?.getLayer()?.batchDraw();
        });

        vid.src = layer.url;
        setVideoElement(vid);

        return () => {
            vid.pause();
            vid.removeAttribute('src');
            vid.load();
        };
    }, [layer.url, layer.numericId]);

    // Seamlessly toggle loop without unmounting the video
    useEffect(() => {
        if (videoElement) videoElement.loop = layer.config.loop ?? true;
    }, [layer.config.loop, videoElement]);

    // 3. Playback Loop (Completely bypasses React state for 60fps performance)
    useEffect(() => {
        if (!videoElement) return;
        const engine = EditorEngine.getInstance();
        const pbRef = { current: engine.getPlayback(layer.numericId) || layer.playback };

        const unsubscribe = engine.subscribeToPlayback((id, pb) => {
            if (id === layer.numericId) {
                pbRef.current = pb;
                if (pb.status === 'paused') {
                    videoElement.pause();
                    if (Math.abs(videoElement.currentTime - pb.anchorMediaTime) > 0.05) {
                        videoElement.currentTime = pb.anchorMediaTime;
                        imageRef.current?.getLayer()?.batchDraw();
                    }
                }
            }
        });

        let frameId: number;
        const loop = () => {
            const pb = pbRef.current;
            if (pb?.status === 'playing') {
                const now = engine.getServerTime();
                if (now >= pb.anchorServerTime) {
                    if (videoElement.paused) videoElement.play().catch(() => {});

                    let expected = pb.anchorMediaTime + (now - pb.anchorServerTime) / 1000;

                    // Native wrapping math to match the browser's loop
                    if ((layer.config.loop ?? true) && layer.config.duration) {
                        expected = expected % layer.config.duration;
                    }
                    const drift = expected - videoElement.currentTime;
                    if (Math.abs(drift) > 0.5) {
                        videoElement.currentTime = expected; // Hard snap for heavy desync
                    } else if (drift > 0.3) {
                        videoElement.playbackRate = 1.05; // Gentle catch up
                    } else if (drift < -0.3) {
                        videoElement.playbackRate = 0.95; // Gentle slow down
                    } else {
                        videoElement.playbackRate = 1.0; // Coast perfectly smoothly
                    }
                    // if (Math.abs(drift) > 0.5) videoElement.currentTime = expected;
                    // else if (drift > 0.05) videoElement.playbackRate = 1.05;
                    // else if (drift < -0.05) videoElement.playbackRate = 0.95;
                    // else videoElement.playbackRate = 1.0;

                    imageRef.current?.getLayer()?.batchDraw();
                }
            }
            frameId = requestAnimationFrame(loop);
        };
        frameId = requestAnimationFrame(loop);

        return () => {
            unsubscribe();
            cancelAnimationFrame(frameId);
        };
    }, [videoElement, layer.numericId, layer.config.loop, layer.config.duration]);

    return (
        <KonvaImage
            ref={imageRef}
            image={videoElement || undefined}
            id={layer.numericId.toString()}
            x={layer.config.cx}
            y={layer.config.cy}
            scaleX={layer.config.scale}
            scaleY={layer.config.scale}
            rotation={layer.config.rotation}
            width={layer.config.w}
            height={layer.config.h}
            offsetX={layer.config.w / 2}
            offsetY={layer.config.h / 2}
            draggable={!isPinching}
            onClick={onSelect}
            onTap={onSelect}
            onDragMove={onTransform}
            onTransform={onTransform}
            onDragEnd={onTransformEnd}
            onTransformEnd={onTransformEnd}
        />
    );
}

// --- SUB-COMPONENT: Static Images & Upload Previews ---
function KonvaStaticImage({ layer, isPinching, onSelect, onTransform, onTransformEnd }: any) {
    const [img, setImg] = useState<HTMLImageElement | null>(null);
    const imageRef = useRef<any>(null);

    useEffect(() => {
        const i = new window.Image();
        if (!layer.url.startsWith('blob:') && !layer.url.startsWith('data:')) {
            i.crossOrigin = 'anonymous';
        }
        i.onload = () => {
            setImg(i);
            imageRef.current?.getLayer()?.batchDraw();
        };
        i.src = layer.url;
    }, [layer.url]);

    return (
        <Group
            id={layer.numericId.toString()}
            x={layer.config.cx}
            y={layer.config.cy}
            scaleX={layer.config.scale}
            scaleY={layer.config.scale}
            rotation={layer.config.rotation}
            draggable={!isPinching}
            onClick={onSelect}
            onTap={onSelect}
            onDragMove={onTransform}
            onTransform={onTransform}
            onDragEnd={onTransformEnd}
            onTransformEnd={onTransformEnd}
        >
            <KonvaImage
                ref={imageRef}
                image={img || undefined}
                width={layer.config.w}
                height={layer.config.h}
                offsetX={layer.config.w / 2}
                offsetY={layer.config.h / 2}
            />

            {/* The Real-Time Processing Overlay */}
            {layer.isUploading && layer.layerType === 'video' && (
                <Group offsetX={layer.config.w / 2} offsetY={layer.config.h / 2}>
                    <Rect width={layer.config.w} height={layer.config.h} fill="rgba(0,0,0,0.6)" />
                    {/* Centered progress bar */}
                    <Rect
                        x={layer.config.w * 0.1}
                        y={layer.config.h / 2 - 20}
                        width={layer.config.w * 0.8}
                        height={40}
                        fill="#222"
                        cornerRadius={20}
                    />
                    <Rect
                        x={layer.config.w * 0.1}
                        y={layer.config.h / 2 - 20}
                        width={layer.config.w * 0.8 * ((layer.progress || 2) / 100)}
                        height={40}
                        fill="#4caf50"
                        cornerRadius={20}
                    />
                    <Text
                        x={layer.config.w * 0.1}
                        y={layer.config.h / 2 + 40}
                        text={`Optimizing Video... ${layer.progress || 0}%`}
                        fill="white"
                        fontSize={48}
                        fontFamily="Arial"
                    />
                </Group>
            )}
        </Group>
    );
}

function RoyStaticRenderer({ layer, isPinching, onSelect, onTransform, onTransformEnd }: any) {
    const imageRef = useRef<Konva.Image>(null);
    useEffect(() => {
        const updateTimer = setInterval(() => {
            const royElement = document.getElementById('roy-force-graph-host') as HTMLCanvasElement;
            const url = royElement.toDataURL();
            royElement.style.height = layer.config.h;
            royElement.style.width = layer.config.w;
            royElement.style.offset = `${layer.config.h / 2 + 'px'}, ${layer.config.w / 2 + 'px'}`;
            if (imageRef.current) {
                const img = new window.Image(layer.config.w, layer.config.h);
                img.src = url;
                imageRef.current.image(img);
                imageRef.current.draw();
            }
        }, 100);
        return () => clearInterval(updateTimer);
    }, []);

    return (
        <KonvaImage
            id={layer.numericId.toString()}
            ref={imageRef}
            image={undefined}
            width={layer.config.w}
            height={layer.config.h}
            offsetX={layer.config.w / 2}
            offsetY={layer.config.h / 2}
            x={layer.config.cx}
            y={layer.config.cy}
            scaleX={layer.config.scale}
            scaleY={layer.config.scale}
            rotation={layer.config.rotation}
            draggable={!isPinching}
            onClick={onSelect}
            onTap={onSelect}
            onDragMove={onTransform}
            onTransform={onTransform}
            onDragEnd={onTransformEnd}
            onTransformEnd={onTransformEnd}
        />
    );
    // return <KonvaStaticImage {...props} ref={imageRef} />;
}

// --- SUB-COMPONENT: Smart Playback Controls ---
export function PlaybackControls({ layer, engine }: { layer: any; engine: any }) {
    const [status, setStatus] = useState(engine.getPlayback(layer.numericId)?.status || 'paused');

    useEffect(() => {
        const unsubscribe = engine.subscribeToPlayback((id: number, pb: any) => {
            if (id === layer.numericId) setStatus(pb.status);
        });
        return () => unsubscribe(); // Properly typed for void return!
    }, [layer.numericId, engine]);

    return (
        <>
            <button
                onClick={() =>
                    engine.sendJSON({
                        type: 'video_seek',
                        numericId: layer.numericId,
                        mediaTime: 0
                    })
                }
            >
                ⏮
            </button>
            {status === 'paused' ? (
                <button
                    style={{ width: '70px' }}
                    onClick={() =>
                        engine.sendJSON({ type: 'video_play', numericId: layer.numericId })
                    }
                >
                    ▶ Play
                </button>
            ) : (
                <button
                    style={{ width: '70px' }}
                    onClick={() =>
                        engine.sendJSON({ type: 'video_pause', numericId: layer.numericId })
                    }
                >
                    ⏸ Pause
                </button>
            )}

            <label
                style={{
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    marginLeft: '10px'
                }}
            >
                <input
                    type="checkbox"
                    checked={layer.config.loop ?? true}
                    onChange={(e) => {
                        const updatedConfig = { ...layer.config, loop: e.target.checked };
                        engine.sendJSON({
                            type: 'upsert_layer',
                            origin: 'pbcInput',
                            numericId: layer.numericId,
                            layerType: layer.type,
                            url: layer.url,
                            config: updatedConfig,
                            playback: engine.getPlayback(layer.numericId)
                        });
                    }}
                />
                Loop
            </label>
        </>
    );
}

// --- SUB-COMPONENT: High-Performance Contextual Video Scrubber ---
export function VideoScrubber({ layer, engine }: { layer: any; engine: any }) {
    const seekInputRef = useRef<HTMLInputElement>(null);
    const spanRef = useRef<HTMLSpanElement>(null);
    const isDragging = useRef(false);
    const hasTriggeredEnd = useRef(false);
    const pbRef = useRef(engine.getPlayback(layer.numericId) || layer.playback);

    useEffect(() => {
        const unsubscribe = engine.subscribeToPlayback((id: number, pb: any) => {
            if (id === layer.numericId) pbRef.current = pb;
        });
        return () => unsubscribe(); // Properly typed for void return!
    }, [layer.numericId, engine]);

    useEffect(() => {
        let frameId: number;
        const loop = () => {
            const pb = pbRef.current;
            if (pb && seekInputRef.current && spanRef.current) {
                let currentTime = pb.anchorMediaTime || 0;

                if (pb.status === 'playing') {
                    const now = engine.getServerTime();
                    let expected =
                        pb.anchorMediaTime + Math.max(0, (now - pb.anchorServerTime) / 1000);

                    if (layer.config.loop ?? true) {
                        if (layer.config.duration) expected = expected % layer.config.duration;
                    } else if (expected >= (layer.config.duration || 0)) {
                        expected = layer.config.duration || 0;
                    }
                    currentTime = expected;
                } else {
                    hasTriggeredEnd.current = false;
                    if (layer.config.duration) currentTime = currentTime % layer.config.duration;
                }

                if (!isDragging.current) {
                    seekInputRef.current.value = currentTime.toString();
                    spanRef.current.innerText = `${currentTime.toFixed(1)}s`;
                }
            }
            frameId = requestAnimationFrame(loop);
        };
        frameId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frameId);
    }, [layer.config.duration, layer.config.loop, layer.numericId, engine]);

    const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
        if (spanRef.current)
            spanRef.current.innerText = `${parseFloat(e.currentTarget.value).toFixed(1)}s`;
    };

    const handleSeek = () => {
        isDragging.current = false;
        if (seekInputRef.current) {
            engine.sendJSON({
                type: 'video_seek',
                numericId: layer.numericId,
                mediaTime: parseFloat(seekInputRef.current.value)
            });
        }
    };

    const safeTime = pbRef.current?.anchorMediaTime || 0;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '300px' }}>
            <span
                ref={spanRef}
                style={{ fontSize: '12px', fontFamily: 'monospace', width: '40px' }}
            >
                {safeTime.toFixed(1)}s
            </span>
            <input
                ref={seekInputRef}
                type="range"
                min="0"
                max={layer.config.duration || 100}
                step="0.01"
                defaultValue={safeTime}
                onPointerDown={() => {
                    isDragging.current = true;
                }}
                onInput={handleInput}
                onPointerUp={handleSeek}
                style={{ flexGrow: 1, cursor: 'pointer' }}
            />
        </div>
    );
}

export function TextEditor({ layer, engine }: { layer: any; engine: EditorEngine }) {
    const [text, setText] = useState(layer.config.markdown);

    const handleTextChange = async (
        e: React.ChangeEvent<HTMLTextAreaElement, HTMLTextAreaElement>
    ) => {
        const newText = e.target.value;

        const { url, w, h } = (await renderTextToSVG(newText)) ?? {};
        if (!url) return;

        layer.config.markdown = newText;
        layer.config.h = h;
        layer.config.w = w;
        layer.url = url;
        setText(e.target.value);
        engine.sendJSON({
            type: 'upsert_layer',
            origin: 'handleTextChange',
            numericId: layer.numericId,
            layerType: layer.layerType,
            url: layer.url,
            config: layer.config,
            playback: layer.playback
        });
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '300px' }}>
            <textarea
                defaultValue={text}
                onChange={handleTextChange}
                style={{ flexGrow: 1, cursor: 'pointer' }}
            />
        </div>
    );
}
