import { createFileRoute } from '@tanstack/react-router';
import Konva from 'konva';
import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Transformer } from 'react-konva';

import { EditorEngine } from '../lib/editorEngine';

const engine = EditorEngine.getInstance();

export const Route = createFileRoute('/editor')({ component: EditorApp });

function EditorApp() {
    const [layers, setLayers] = useState<any[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const nextId = useRef(1);
    const trRef = useRef<any>(null);

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
                scale: initialScale
            };

            const newLayer = { numericId, layerType: 'video', url: data.url, config };

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

    const handleTransform = (e: any, numericId: number) => {
        const node = e.target;
        // node.scaleX() is automatically updated by the Transformer
        engine.broadcastBinaryMove(numericId, node.x(), node.y(), node.scaleX(), node.rotation());
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

    // --- SELECTION LOGIC ---
    const checkDeselect = (e: any) => {
        // If the user clicks on the empty stage background, deselect everything
        const clickedOnEmpty = e.target === e.target.getStage();
        if (clickedOnEmpty) {
            setSelectedId(null);
        }
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

            {/* Bind checkDeselect to the Stage */}
            <Stage
                width={window.innerWidth}
                height={window.innerHeight}
                onMouseDown={checkDeselect}
                onTouchStart={checkDeselect}
            >
                <Layer>
                    {layers.map((layer) => (
                        <KonvaVideo
                            key={layer.numericId}
                            layer={layer}
                            onSelect={() => setSelectedId(layer.numericId.toString())}
                            onTransform={(e) => handleTransform(e, layer.numericId)}
                        />
                    ))}

                    {/* THE TRANSFORMER */}
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
    onSelect,
    onTransform
}: {
    layer: any;
    onSelect: () => void;
    onTransform: (e: any) => void;
}) {
    const imageRef = useRef<any>(null);
    const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);

    useEffect(() => {
        const vid = document.createElement('video');
        vid.src = layer.url;
        vid.crossOrigin = 'anonymous';
        vid.muted = true;

        vid.addEventListener('loadeddata', () => {
            vid.currentTime = layer.playback?.anchorMediaTime || 0;
            imageRef.current?.getLayer()?.batchDraw();
        });

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
            scaleX={layer.config.scale}
            scaleY={layer.config.scale}
            rotation={layer.config.rotation}
            draggable
            // NEW: Bind selection clicks
            onClick={onSelect}
            onTap={onSelect}
            // Trigger binary broadcast during drag OR transform
            onDragMove={onTransform}
            onTransform={onTransform}
        />
    );
}
