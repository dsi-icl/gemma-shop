import { createFileRoute } from '@tanstack/react-router';
import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Transformer } from 'react-konva';

import { EditorEngine } from '../lib/editorEngine';

const engine = EditorEngine.getInstance();

export const Route = createFileRoute('/editor')({ component: EditorApp });

function getDistance(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

function getAngle(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    // Returns angle in degrees
    return (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
}

function EditorApp() {
    const [layers, setLayers] = useState<any[] /* VirtualLayerState[] */>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [highestZ, setHighestZ] = useState(1);
    const [isPinching, setIsPinching] = useState(false);

    const nextId = useRef(1);
    const trRef = useRef<any>(null);
    const lastCenter = useRef<{ x: number; y: number } | null>(null);
    const lastDist = useRef<number | null>(null);
    const lastAngle = useRef<number | null>(null);

    useEffect(() => {
        const unsubscribe = engine.subscribe((data) => {
            if (data.type === 'hydrate') {
                setLayers(data.layers);
                if (data.layers.length > 0) {
                    nextId.current = Math.max(...data.layers.map((l: any) => l.numericId)) + 1;
                }
            } else if (data.type === 'video_sync' || data.type === 'video_seek') {
                setLayers((prev) =>
                    prev.map((layer) =>
                        layer.numericId === data.numericId
                            ? { ...layer, playback: data.playback }
                            : layer
                    )
                );
            }
        });
        return unsubscribe;
    }, []);

    // --- ACTIONS ---
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('asset', file);

        try {
            const res = await fetch(`/upload`, { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Upload failed');
            const data = await res.json();

            const { videoWidth, videoHeight } = await new Promise<{
                videoWidth: number;
                videoHeight: number;
            }>((resolve) => {
                const tempVid = document.createElement('video');
                tempVid.src = data.url;
                tempVid.addEventListener('loadedmetadata', () => {
                    resolve({ videoWidth: tempVid.videoWidth, videoHeight: tempVid.videoHeight });
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
                scale: initialScale,
                zIndex: highestZ
            };

            const newLayer /* VirtualLayerState */ = {
                numericId,
                layerType: 'video',
                url: data.url,
                config
            };

            setLayers((prev) => [...prev, newLayer]);
            engine.sendJSON({
                type: 'upsert_layer',
                numericId,
                layerType: 'video',
                url: data.url,
                config
            });

            // Auto-select the newly uploaded video
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

        // Find the layer and update it
        const layerToUpdate = layers.find((l) => l.numericId === numericId);
        if (!layerToUpdate) return;

        const updatedConfig = { ...layerToUpdate.config, zIndex: newZ };

        // Optimistically update local state
        setLayers((prev) =>
            prev.map((l) => (l.numericId === numericId ? { ...l, config: updatedConfig } : l))
        );

        // Broadcast the updated config to the Wall
        engine.sendJSON({
            type: 'upsert_layer',
            numericId: numericId,
            layerType: 'video',
            url: layerToUpdate.url,
            config: updatedConfig,
            playback: layerToUpdate.playback // Preserve playback state!
        });
    };

    // --- MULTITOUCH GESTURE LOGIC ---
    const handleTouchStart = (e: KonvaEventObject<any /* MouseEvent | TouchEvent */>) => {
        if (e.evt.touches?.length === 1) {
            const clickedOnEmpty = e.target === e.target.getStage();
            if (clickedOnEmpty) setSelectedId(null);
        }

        // When two fingers hit, disable native dragging!
        if (e.evt.touches?.length === 2) {
            setIsPinching(true);

            if (selectedId) {
                const t1 = e.evt.touches[0];
                const t2 = e.evt.touches[1];
                const p1 = { x: t1.clientX, y: t1.clientY };
                const p2 = { x: t2.clientX, y: t2.clientY };

                lastDist.current = getDistance(p1, p2);
                lastAngle.current = getAngle(p1, p2);
                lastCenter.current = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            }
        }
    };

    const handleTouchMove = (e: KonvaEventObject<TouchEvent>) => {
        e.evt.preventDefault();

        if (e.evt.touches?.length === 2 && selectedId && trRef.current) {
            const stage = trRef.current.getStage();
            const node = stage.findOne(`#${selectedId}`);
            if (!node) return;

            const t1 = e.evt.touches[0];
            const t2 = e.evt.touches[1];
            const p1 = { x: t1.clientX, y: t1.clientY };
            const p2 = { x: t2.clientX, y: t2.clientY };

            const dist = getDistance(p1, p2);
            const angle = getAngle(p1, p2);
            const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

            if (!lastDist.current || !lastAngle.current || !lastCenter.current) return;

            const scaleBy = dist / lastDist.current;
            const angleDelta = angle - lastAngle.current;
            const dx = center.x - lastCenter.current.x;
            const dy = center.y - lastCenter.current.y;

            const newScale = node.scaleX() * scaleBy;
            if (newScale > 0.1 && newScale < 10) {
                node.scaleX(newScale);
                node.scaleY(newScale);
            }

            node.rotation(node.rotation() + angleDelta);
            node.x(node.x() + dx);
            node.y(node.y() + dy);

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
            lastCenter.current = center;
        }
    };

    const handleTouchEnd = (e: KonvaEventObject<TouchEvent>) => {
        // If fewer than 2 fingers remain, re-enable standard single-finger dragging
        if (e.evt.touches?.length < 2) {
            setIsPinching(false);
        }
        lastDist.current = null;
        lastAngle.current = null;
        lastCenter.current = null;
    };

    const handleTransform = (e: any, numericId: number) => {
        const node = e.target;
        // node.scaleX() is automatically updated by the Transformer
        engine.broadcastBinaryMove(numericId, node.x(), node.y(), node.scaleX(), node.rotation());
    };

    const handleTransformEnd = (e: any, numericId: number) => {
        const node = e.target;

        // Find the current layer state
        const layerToUpdate = layers.find((l) => l.numericId === numericId);
        if (!layerToUpdate) return;

        const updatedConfig = {
            ...layerToUpdate.config,
            cx: node.x(),
            cy: node.y(),
            scale: node.scaleX(),
            rotation: node.rotation()
        };

        // Update local React state optimistically
        setLayers((prev) =>
            prev.map((l) => (l.numericId === numericId ? { ...l, config: updatedConfig } : l))
        );

        // Update the Master Server State via JSON
        engine.sendJSON({
            type: 'upsert_layer',
            numericId,
            layerType: 'video',
            url: layerToUpdate.url,
            config: updatedConfig,
            playback: layerToUpdate.playback
        });
    };

    const broadcastPlayback = (action: string) => {
        layers.forEach((layer) => {
            if (action === 'play')
                engine.sendJSON({ type: 'video_play', numericId: layer.numericId });
            if (action === 'pause')
                engine.sendJSON({ type: 'video_pause', numericId: layer.numericId });
            if (action === 'rewind')
                engine.sendJSON({ type: 'video_seek', numericId: layer.numericId, mediaTime: 0 });
        });
    };

    // Effect to physically attach the Transformer to the selected node
    useEffect(() => {
        if (selectedId && trRef.current) {
            // Find the node in Konva's internal scene graph
            const node = trRef.current.getStage().findOne(`#${selectedId}`);
            if (node) {
                trRef.current.nodes([node]);
                trRef.current.getLayer().batchDraw();
            }
        } else if (trRef.current) {
            // Detach if nothing is selected
            trRef.current.nodes([]);
            trRef.current.getLayer().batchDraw();
        }
    }, [selectedId, layers]);

    return (
        <div style={{ width: '100vw', height: '100vh', margin: 0 }}>
            {/* Control Panel */}
            <div
                style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    zIndex: 10,
                    background: 'white',
                    padding: 15,
                    borderRadius: 8,
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center'
                }}
            >
                <input type="file" accept="video/mp4" onChange={handleUpload} />
                <div
                    style={{ borderLeft: '1px solid #ccc', height: '24px', margin: '0 10px' }}
                ></div>
                <button onClick={() => broadcastPlayback('rewind')}>⏮</button>
                <button onClick={() => broadcastPlayback('play')}>▶</button>
                <button onClick={() => broadcastPlayback('pause')}>⏸</button>
                <div
                    style={{ borderLeft: '1px solid #ccc', height: '24px', margin: '0 10px' }}
                ></div>
                <button onClick={handleBringToFront} disabled={!selectedId}>
                    Bring to Front
                </button>
            </div>

            {/* Bind checkDeselect to the Stage */}
            <Stage
                width={window.innerWidth}
                height={window.innerHeight}
                onMouseDown={handleTouchStart}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <Layer>
                    {layers
                        .sort((a, b) => (a.config.zIndex || 0) - (b.config.zIndex || 0))
                        .map((layer) => (
                            <KonvaVideo
                                key={layer.numericId}
                                layer={layer}
                                isPinching={isPinching}
                                onSelect={() => setSelectedId(layer.numericId.toString())}
                                onTransform={(e) => handleTransform(e, layer.numericId)}
                                onTransformEnd={(e) => handleTransformEnd(e, layer.numericId)}
                            />
                        ))}

                    <Transformer
                        ref={trRef}
                        keepRatio={true} // Forces uniform scaling (maintains aspect ratio)
                        boundBoxFunc={(oldBox, newBox) => {
                            // Prevent scaling the video into oblivion (min size 50px)
                            if (Math.abs(newBox.width) < 50 || Math.abs(newBox.height) < 50) {
                                return oldBox;
                            }
                            return newBox;
                        }}
                    />
                </Layer>
            </Stage>
        </div>
    );
}

// --- SUB-COMPONENT: Live Video inside Konva ---
function KonvaVideo({
    layer,
    isPinching,
    onSelect,
    onTransform,
    onTransformEnd
}: {
    layer: any;
    isPinching: boolean;
    onSelect: () => void;
    onTransform: (e: any) => void;
    onTransformEnd: (e: any) => void;
}) {
    const imageRef = useRef<any>(null);
    const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);

    // 1. Setup the element and Konva redraw loop
    useEffect(() => {
        const vid = document.createElement('video');
        vid.src = layer.url;
        vid.crossOrigin = 'anonymous';
        vid.muted = true;

        vid.addEventListener('loadeddata', () => {
            const targetTime = layer.playback?.anchorMediaTime || 0;

            // Let the 'seeked' event handle the drawing once the frame is actually ready.
            if (targetTime > 0.05) {
                vid.currentTime = targetTime;
            } else {
                // If the target is basically 0, it's safe to paint the first frame instantly.
                imageRef.current?.getLayer()?.batchDraw();
            }
        });

        // This fires when the async seek from loadeddata (or a pause command) finishes
        vid.addEventListener('seeked', () => {
            imageRef.current?.getLayer()?.batchDraw();
        });

        setVideoElement(vid);

        const anim = new Konva.Animation(() => {
            if (!vid.paused) {
                imageRef.current?.getLayer()?.batchDraw();
            }
        }, imageRef.current?.getLayer());

        anim.start();

        return () => {
            anim.stop();
            vid.pause();
            vid.removeAttribute('src');
            vid.load();
        };
    }, [layer.url]);

    // 2. Control Playback based on Server State
    useEffect(() => {
        if (!videoElement || !layer.playback) return;

        let frameId: number;

        if (layer.playback.status === 'paused') {
            videoElement.pause();

            // Prevents floating-point mismatch thrashing while keeping visual sync perfectly tight.
            if (Math.abs(videoElement.currentTime - layer.playback.anchorMediaTime) > 0.05) {
                videoElement.currentTime = layer.playback.anchorMediaTime;
            }
        } else if (layer.playback.status === 'playing') {
            const loop = () => {
                const engine = EditorEngine.getInstance();
                const now = engine.getServerTime();

                if (now >= layer.playback.anchorServerTime) {
                    if (videoElement.paused) {
                        videoElement
                            .play()
                            .catch((e) => console.warn('Editor autoplay blocked', e));
                    }

                    const expectedTime =
                        layer.playback.anchorMediaTime +
                        (now - layer.playback.anchorServerTime) / 1000;
                    const drift = expectedTime - videoElement.currentTime;

                    if (Math.abs(drift) > 0.5) {
                        videoElement.currentTime = expectedTime;
                    } else if (drift > 0.05) {
                        videoElement.playbackRate = 1.05;
                    } else if (drift < -0.05) {
                        videoElement.playbackRate = 0.95;
                    } else {
                        videoElement.playbackRate = 1.0;
                    }
                }
                frameId = requestAnimationFrame(loop);
            };
            frameId = requestAnimationFrame(loop);
        }

        return () => {
            if (frameId) cancelAnimationFrame(frameId);
        };
    }, [layer.playback, videoElement]);

    if (!videoElement) return null;

    return (
        <KonvaImage
            ref={imageRef}
            image={videoElement}
            id={layer.numericId.toString()}
            x={layer.config.cx}
            y={layer.config.cy}
            width={layer.config.w}
            height={layer.config.h}
            offsetX={layer.config.w / 2}
            offsetY={layer.config.h / 2}
            scaleX={layer.config.scale}
            scaleY={layer.config.scale}
            rotation={layer.config.rotation}
            draggable={!isPinching}
            onClick={onSelect}
            onTap={onSelect}
            // Trigger binary broadcast during drag OR transform
            onDragMove={onTransform}
            onDragEnd={onTransformEnd}
            onTransform={onTransform}
            onTransformEnd={onTransformEnd}
        />
    );
}
