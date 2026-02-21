'use client';
import { createFileRoute } from '@tanstack/react-router';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Rect } from 'react-konva';

import { EditorEngine } from '../lib/editorEngine';

const API_URL = `http://localhost:3000`;

// 1. Initialize Engine Singleton ONCE outside the component
const engine = EditorEngine.getInstance();

interface EditorLayer {
    numericId: number;
    url: string;
    config: { cx: number; cy: number; w: number; h: number; rotation: number; scale: number };
}

export const Route = createFileRoute('/editor')({ component: EditorApp });

function EditorApp() {
    const [layers, setLayers] = useState<EditorLayer[]>([]);
    const nextId = useRef(1);

    // 2. Subscribe to Server State
    useEffect(() => {
        const unsubscribe = engine.subscribe((data) => {
            // Hydrate state from server if we refresh the page
            if (data.type === 'hydrate') {
                setLayers(data.layers);
                // Ensure our local ID generator doesn't collide with hydrated IDs
                if (data.layers.length > 0) {
                    const maxId = Math.max(...data.layers.map((l: any) => l.numericId));
                    nextId.current = maxId + 1;
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
            const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Upload failed');
            const data = await res.json();

            const numericId = nextId.current++;
            const newLayer: EditorLayer = {
                numericId,
                url: data.url,
                config: { cx: 400, cy: 300, w: 400, h: 225, rotation: 0, scale: 1 }
            };

            // Optimistic UI update
            setLayers((prev) => [...prev, newLayer]);

            // Tell the wall screens to mount it via the Engine
            engine.sendJSON({
                type: 'upsert_layer',
                numericId,
                layerType: 'video',
                url: data.url,
                config: newLayer.config
            });
        } catch (err) {
            console.error(err);
            alert('Failed to upload asset.');
        }
    };

    const handlePlayAll = () => {
        layers.forEach((layer) => {
            engine.sendJSON({ type: 'video_play', numericId: layer.numericId });
        });
    };

    const handleTransform = (e: KonvaEventObject<Event>, numericId: number) => {
        const node = e.target;
        // Push the raw binary movement data to the Engine
        engine.broadcastBinaryMove(numericId, node.x(), node.y(), node.scaleX(), node.rotation());
    };

    // --- RENDER ---
    return (
        <div style={{ width: '100vw', height: '100vh', background: '#e0e0e0', margin: 0 }}>
            {/* Editor Controls */}
            <div
                style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    zIndex: 10,
                    background: 'white',
                    padding: 15,
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}
            >
                <input
                    type="file"
                    accept="video/mp4"
                    onChange={handleUpload}
                    style={{ marginRight: 15 }}
                />
                <button
                    onClick={handlePlayAll}
                    style={{
                        padding: '8px 16px',
                        cursor: 'pointer',
                        background: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4
                    }}
                >
                    Play All Videos
                </button>
            </div>

            {/* Konva Canvas */}
            <Stage width={window.innerWidth} height={window.innerHeight}>
                <Layer>
                    {layers.map((layer) => (
                        <Rect
                            key={layer.numericId}
                            id={layer.numericId.toString()}
                            x={layer.config.cx}
                            y={layer.config.cy}
                            width={layer.config.w}
                            height={layer.config.h}
                            offsetX={layer.config.w / 2} // Force Konva Center-Origin!
                            offsetY={layer.config.h / 2}
                            fill="#3498db"
                            draggable
                            onDragMove={(e) => handleTransform(e, layer.numericId)}
                            onTransform={(e) => handleTransform(e, layer.numericId)}
                        />
                    ))}
                </Layer>
            </Stage>
        </div>
    );
}
