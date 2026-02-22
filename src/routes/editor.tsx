'use client';

import { createFileRoute } from '@tanstack/react-router';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Transformer, Group, Text, Rect } from 'react-konva';

import { EditorEngine } from '../lib/editorEngine';

const engine = EditorEngine.getInstance();

const SCREEN_W = 1920;
const SCREEN_H = 1080;
const COLS = 16;
const ROWS = 4;

export const Route = createFileRoute('/editor')({ component: EditorApp });

function getDistance(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

function getAngle(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    return (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
}

function EditorApp() {
    const [layers, setLayers] = useState<any[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [highestZ, setHighestZ] = useState(1);
    const [isPinching, setIsPinching] = useState(false);
    const isNetworkUpdate = useRef(false);

    // Prevents stale data from erasing coordinates on click!
    const layersRef = useRef<any[]>([]);
    useEffect(() => {
        layersRef.current = layers;
    }, [layers]);

    const nextId = useRef(1);
    const trRef = useRef<any>(null);
    const lastCenter = useRef<{ x: number; y: number } | null>(null);
    const lastDist = useRef<number | null>(null);
    const lastAngle = useRef<number | null>(null);

    useEffect(() => {
        // 1. JSON Slow-Path (Hydration and Setup ONLY. Playback has been stripped out!)
        const unsubscribeJSON = engine.subscribe((data) => {
            if (data.type === 'hydrate') {
                setLayers(data.layers);
                if (data.layers.length > 0)
                    nextId.current = Math.max(...data.layers.map((l: any) => l.numericId)) + 1;
            } else if (data.type === 'upsert_layer') {
                setLayers((prev) => {
                    const filtered = prev.filter((l) => l.numericId !== data.numericId);
                    return [...filtered, data];
                });
            }
        });

        // 2. Binary Fast-Path
        const unsubscribeBinary = engine.subscribeToBinary((id, cx, cy, scale, rotation) => {
            isNetworkUpdate.current = true;
            try {
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
                }
            } finally {
                isNetworkUpdate.current = false;
            }
        });

        return () => {
            unsubscribeJSON();
            unsubscribeBinary();
        };
    }, [selectedId, isPinching]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('asset', file);

        try {
            const res = await fetch(`/upload`, { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Upload failed');
            const data = await res.json();

            const { videoWidth, videoHeight, duration } = await new Promise<{
                videoWidth: number;
                videoHeight: number;
                duration: number;
            }>((resolve) => {
                const tempVid = document.createElement('video');
                tempVid.src = data.url;
                tempVid.addEventListener('loadedmetadata', () => {
                    resolve({
                        videoWidth: tempVid.videoWidth,
                        videoHeight: tempVid.videoHeight,
                        duration: tempVid.duration
                    });
                });
            });

            const numericId = nextId.current++;
            const initialScale = Math.min(1, 640 / videoWidth);

            const config = {
                cx: 400,
                cy: 300,
                w: videoWidth,
                h: videoHeight,
                rotation: 0,
                duration: duration,
                scale: initialScale,
                zIndex: highestZ,
                loop: true // Auto-loop enabled by default
            };

            const defaultPlayback = {
                status: 'paused',
                anchorMediaTime: 0,
                anchorServerTime: engine.getServerTime()
            };

            const newLayer = {
                numericId,
                layerType: 'video',
                url: data.url,
                playback: defaultPlayback,
                config
            };

            setLayers((prev) => [...prev, newLayer]);

            // Register it locally in the Engine so the UI controls work instantly
            engine.setPlayback(numericId, defaultPlayback);

            engine.sendJSON({
                type: 'upsert_layer',
                numericId,
                layerType: 'video',
                playback: defaultPlayback,
                url: data.url,
                config
            });

            setSelectedId(numericId.toString());
        } catch (err) {
            alert('Upload failed. Check Bun server console.');
        }
    };

    const handleBringToFront = () => {
        if (!selectedId) return;
        const newZ = highestZ + 1;
        setHighestZ(newZ);
        const numericId = parseInt(selectedId);
        const layerToUpdate = layers.find((l) => l.numericId === numericId);
        if (!layerToUpdate) return;

        const updatedConfig = { ...layerToUpdate.config, zIndex: newZ };
        setLayers((prev) =>
            prev.map((l) => (l.numericId === numericId ? { ...l, config: updatedConfig } : l))
        );

        engine.sendJSON({
            type: 'upsert_layer',
            numericId: numericId,
            layerType: 'video',
            url: layerToUpdate.url,
            config: updatedConfig,
            playback: engine.getPlayback(numericId) || layerToUpdate.playback
        });
    };

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
        if (isNetworkUpdate.current) return;
        const node = e.target;
        engine.broadcastBinaryMove(numericId, node.x(), node.y(), node.scaleX(), node.rotation());
    };

    const handleTransformEnd = (e: any, numericId: number) => {
        if (isNetworkUpdate.current) return;
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
            numericId,
            layerType: 'video',
            url: layerToUpdate.url,
            config: updatedConfig,
            playback: truePlayback
        });
    };

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
    }, [selectedId, layers]);

    return (
        <div style={{ width: '100vw', height: '100vh', margin: 0 }}>
            {/* Dynamic Control Panel */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 10,
                    left: 10,
                    zIndex: 10,
                    background: 'white',
                    padding: 15,
                    borderRadius: 8,
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center',
                    scale: 2,
                    transformOrigin: 'left bottom'
                }}
            >
                <input type="file" accept="video/mp4" onChange={handleUpload} />
                <button
                    onClick={() => {
                        engine.sendJSON({ type: 'clear_stage' });
                        setSelectedId(null);
                    }}
                    style={{ color: 'red', fontWeight: 'bold' }}
                >
                    Reset Stage
                </button>
                {selectedId &&
                    (() => {
                        const activeLayer = layers.find(
                            (l) => l.numericId === parseInt(selectedId)
                        );
                        if (!activeLayer) return null;

                        return (
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

                                <div
                                    style={{
                                        borderLeft: '1px solid #ccc',
                                        height: '24px',
                                        margin: '0 10px'
                                    }}
                                ></div>
                                <button onClick={handleBringToFront}>Bring to Front</button>
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
                        .map((layer) => (
                            <KonvaVideo
                                key={layer.numericId}
                                layer={layer}
                                isPinching={isPinching}
                                onSelect={() => setSelectedId(layer.numericId.toString())}
                                onTransform={(e: any) => handleTransform(e, layer.numericId)}
                                onTransformEnd={(e: any) => handleTransformEnd(e, layer.numericId)}
                            />
                        ))}

                    <Transformer
                        ref={trRef}
                        keepRatio={true}
                        boundBoxFunc={(oldBox, newBox) => {
                            if (Math.abs(newBox.width) < 50 || Math.abs(newBox.height) < 50)
                                return oldBox;
                            return newBox;
                        }}
                        onDragEnd={() => {
                            if (selectedId && trRef.current) {
                                const node = trRef.current.nodes()[0];
                                if (node)
                                    handleTransformEnd({ target: node }, parseInt(selectedId));
                            }
                        }}
                        onTransformEnd={() => {
                            if (selectedId && trRef.current) {
                                const node = trRef.current.nodes()[0];
                                if (node)
                                    handleTransformEnd({ target: node }, parseInt(selectedId));
                            }
                        }}
                    />
                </Layer>
            </Stage>
        </div>
    );
}

// --- SUB-COMPONENT: Live Video inside Konva ---
function KonvaVideo({ layer, isPinching, onSelect, onTransform, onTransformEnd }: any) {
    const imageRef = useRef<any>(null);
    const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);

    useEffect(() => {
        const vid = document.createElement('video');
        vid.crossOrigin = 'anonymous';
        vid.muted = true;
        vid.playsInline = true;
        vid.loop = layer.config.loop ?? true;
        vid.src = layer.url;

        // Force a canvas paint the exact millisecond the browser has a frame ready
        vid.addEventListener('canplay', () => {
            imageRef.current?.getLayer()?.batchDraw();
        });

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
                    if (Math.abs(drift) > 0.5) videoElement.currentTime = expected;
                    else if (drift > 0.05) videoElement.playbackRate = 1.05;
                    else if (drift < -0.05) videoElement.playbackRate = 0.95;
                    else videoElement.playbackRate = 1.0;

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
s            x={layer.config.cx}
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
                    onClick={() =>
                        engine.sendJSON({ type: 'video_play', numericId: layer.numericId })
                    }
                >
                    ▶ Play
                </button>
            ) : (
                <button
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
                            numericId: layer.numericId,
                            layerType: 'video',
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
    const inputRef = useRef<HTMLInputElement>(null);
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
            if (pb && inputRef.current && spanRef.current) {
                let currentTime = pb.anchorMediaTime || 0;

                if (pb.status === 'playing') {
                    const now = engine.getServerTime();
                    let expected =
                        pb.anchorMediaTime + Math.max(0, (now - pb.anchorServerTime) / 1000);

                    if (layer.config.loop ?? true) {
                        if (layer.config.duration) expected = expected % layer.config.duration;
                        hasTriggeredEnd.current = false;
                    } else if (expected >= (layer.config.duration || 0)) {
                        if (!hasTriggeredEnd.current) {
                            hasTriggeredEnd.current = true;
                            engine.sendJSON({ type: 'video_pause', numericId: layer.numericId });
                            engine.sendJSON({
                                type: 'video_seek',
                                numericId: layer.numericId,
                                mediaTime: layer.config.duration
                            });
                        }
                        expected = layer.config.duration || 0;
                    } else {
                        hasTriggeredEnd.current = false;
                    }
                    currentTime = expected;
                } else {
                    hasTriggeredEnd.current = false;
                }

                if (!isDragging.current) {
                    inputRef.current.value = currentTime.toString();
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
        if (inputRef.current) {
            engine.sendJSON({
                type: 'video_seek',
                numericId: layer.numericId,
                mediaTime: parseFloat(inputRef.current.value)
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
                ref={inputRef}
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
