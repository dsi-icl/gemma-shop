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

            const numericId = nextId.current++;
            const config = { cx: 400, cy: 300, w: 640, h: 360, rotation: 0, scale: 1 };

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

    useEffect(() => {
        // Create an invisible DOM video element
        const vid = document.createElement('video');
        vid.src = layer.url;
        vid.crossOrigin = 'anonymous';
        vid.muted = true;
        vid.loop = true;
        vid.play(); // Auto-play locally in the editor so you can see it moving
        setVideoElement(vid);

        // // Force Konva to redraw every frame so the video animates
        // const anim = new Konva.Animation(() => {}, imageRef.current?.getLayer());
        // anim.start();
        // Force Konva to redraw every frame so the video animates
        const anim = new Konva.Animation(() => {
            imageRef.current?.getLayer()?.batchDraw(); // Explicitly force the redraw
        }, imageRef.current?.getLayer());

        anim.start();

        return () => {
            anim.stop();
            vid.pause();
            vid.removeAttribute('src');
            vid.load();
        };
    }, [layer.url]);

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
            offsetX={layer.config.w / 2} // Crucial for Center Origin
            offsetY={layer.config.h / 2}
            draggable
            onDragMove={onTransform}
            onTransform={onTransform}
        />
    );
}
