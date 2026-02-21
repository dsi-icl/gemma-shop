'use client';

import { createFileRoute } from '@tanstack/react-router';
import Konva from 'konva';
import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';

import { EditorEngine } from '../lib/editorEngine';

const engine = EditorEngine.getInstance();

export const Route = createFileRoute('/editor')({ component: EditorApp });

function EditorApp() {
    const [layers, setLayers] = useState<any[]>([]);
    const nextId = useRef(1);

    useEffect(() => {
        const unsubscribe = engine.subscribe((data) => {
            if (data.type === 'hydrate') {
                setLayers(data.layers);
                if (data.layers.length > 0) {
                    nextId.current = Math.max(...data.layers.map((l: any) => l.numericId)) + 1;
                }
            }
            // Listen for incoming playback syncs!
            else if (data.type === 'video_sync' || data.type === 'video_seek') {
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

            // NEW: Extract true native video dimensions before broadcasting
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

            // Scale it down so a massive 4K video fits nicely on the editor screen
            const initialScale = Math.min(1, 640 / videoWidth);

            const config = {
                cx: 400,
                cy: 300,
                w: videoWidth,
                h: videoHeight,
                rotation: 0,
                scale: initialScale
            };

            const newLayer = { numericId, layerType: 'video', url: data.url, config };

            setLayers((prev) => [...prev, newLayer]);

            // Broadcast to Walls
            engine.sendJSON({
                type: 'upsert_layer',
                numericId,
                layerType: 'video',
                url: data.url,
                config
            });
        } catch (err) {
            alert('Upload failed. Check Bun server console.');
        }
    };

    const handleTransform = (e: any, numericId: number) => {
        const node = e.target;
        engine.broadcastBinaryMove(numericId, node.x(), node.y(), node.scaleX(), node.rotation());
    };

    // --- PLAYBACK CONTROLS ---
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

    return (
        <div style={{ width: '100vw', height: '100vh', background: '#333', margin: 0 }}>
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
                <button onClick={() => broadcastPlayback('rewind')}>⏮ Rewind</button>
                <button onClick={() => broadcastPlayback('play')}>▶ Play All</button>
                <button onClick={() => broadcastPlayback('pause')}>⏸ Pause All</button>
            </div>

            <Stage width={window.innerWidth} height={window.innerHeight}>
                <Layer>
                    {layers.map((layer) => (
                        <KonvaVideo
                            key={layer.numericId}
                            layer={layer}
                            onTransform={(e) => handleTransform(e, layer.numericId)}
                        />
                    ))}
                </Layer>
            </Stage>
        </div>
    );
}

// --- SUB-COMPONENT: Live Video inside Konva ---
function KonvaVideo({ layer, onTransform }: { layer: any; onTransform: (e: any) => void }) {
    const imageRef = useRef<any>(null);
    const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);

    // 1. Setup the element and Konva redraw loop
    useEffect(() => {
        const vid = document.createElement('video');
        vid.src = layer.url;
        vid.crossOrigin = 'anonymous';
        vid.muted = true;

        // THE FIX: When the first frame is actually ready to be drawn
        vid.addEventListener('loadeddata', () => {
            // Set to the server's expected time (or 0)
            vid.currentTime = layer.playback?.anchorMediaTime || 0;
            // Explicitly tell Konva to draw this initial frame
            imageRef.current?.getLayer()?.batchDraw();
        });

        // THE FIX: When the video is scrubbed/seeked while paused
        vid.addEventListener('seeked', () => {
            imageRef.current?.getLayer()?.batchDraw();
        });

        setVideoElement(vid);

        // OPTIMIZATION: Only redraw the canvas 60fps if the video is actually playing
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

        if (layer.playback.status === 'paused') {
            videoElement.pause();
            if (Math.abs(videoElement.currentTime - layer.playback.anchorMediaTime) > 0.1) {
                videoElement.currentTime = layer.playback.anchorMediaTime;
            }
        } else if (layer.playback.status === 'playing') {
            const checkTime = () => {
                const engine = EditorEngine.getInstance();
                const now = engine.getServerTime();

                if (now >= layer.playback.anchorServerTime) {
                    const expectedTime =
                        layer.playback.anchorMediaTime +
                        Math.max(0, (now - layer.playback.anchorServerTime) / 1000);

                    if (Math.abs(videoElement.currentTime - expectedTime) > 0.2) {
                        videoElement.currentTime = expectedTime;
                    }

                    videoElement.play().catch((e) => console.warn('Editor autoplay blocked', e));
                } else {
                    requestAnimationFrame(checkTime);
                }
            };
            requestAnimationFrame(checkTime);
        }
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
            scaleX={layer.config.scale} // Apply the scale!
            scaleY={layer.config.scale}
            rotation={layer.config.rotation}
            draggable
            onDragMove={onTransform}
            onTransform={onTransform}
        />
    );
}
