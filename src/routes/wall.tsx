'use client';

import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import type { LayerState } from '@/lib/types';

import { WallEngine } from '../lib/wallEngine';

const MY_VIEWPORT = { x: 0, y: 0, w: 1920, h: 1080 };

// Initialize the Singleton Engine once
const engine = WallEngine.getInstance(MY_VIEWPORT);

export const Route = createFileRoute('/wall')({ component: WallApp });

function WallApp() {
    const [layers, setLayers] = useState<LayerState[]>([]);

    useEffect(() => {
        // 1. Subscribe to Server State (JSON)
        const unsubscribe = engine.subscribeToLayoutUpdates((data) => {
            if (data.type === 'hydrate') {
                setLayers(data.layers);
            } else if (data.type === 'upsert_layer') {
                setLayers((prev) => {
                    const filtered = prev.filter((l) => l.numericId !== data.numericId);
                    return [...filtered, data];
                });
            }
        });

        // 2. Start the Fast-Path Render Loop (60fps DOM mutation)
        let frameId: number;
        const loop = () => {
            engine.layers.forEach((layer) => {
                if (!layer.el) return;

                // Calculate current interpolated position based on master clock
                const pos = engine.calculateCurrentPosition(layer);

                // Convert global center coordinates to local viewport coordinates
                const w = layer.config.w;
                const h = layer.config.h;
                const localX = pos.cx - w / 2 - MY_VIEWPORT.x;
                const localY = pos.cy - h / 2 - MY_VIEWPORT.y;

                // Mutate the DOM directly, bypassing React
                layer.el.style.transform = `translate3d(${localX}px, ${localY}px, 0) rotate(${pos.rotation}deg) scale(${pos.scale})`;
            });
            frameId = requestAnimationFrame(loop);
        };

        frameId = requestAnimationFrame(loop);

        return () => {
            unsubscribe();
            cancelAnimationFrame(frameId);
        };
    }, []);

    return (
        <div
            style={{
                margin: 0,
                overflow: 'hidden',
                background: '#000',
                width: '100vw',
                height: '100vh',
                position: 'relative'
            }}
        >
            {layers.map((layer) => (
                <video
                    key={layer.numericId}
                    src={layer.url}
                    muted
                    playsInline
                    // Pass the raw DOM element to the Engine
                    ref={(el) => {
                        if (el)
                            engine.registerLayer(layer.numericId, layer.config, layer.playback, el);
                    }}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: `${layer.config.w}px`,
                        height: `${layer.config.h}px`,
                        transformOrigin: '50% 50%', // Crucial for rotation/scaling
                        zIndex: layer.config.zIndex || 1
                    }}
                />
            ))}
        </div>
    );
}
