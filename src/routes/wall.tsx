'use client';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { WallEngine } from '../lib/wallEngine';

// 1. Initialize Engine Singleton ONCE
const engine = WallEngine.getInstance();

export const Route = createFileRoute('/wall')({ component: WallApp });

function WallApp() {
    const [layers, setLayers] = useState<any[]>([]);

    // 2. Subscribe to "Slow" Layout Changes (Mount/Unmount)
    useEffect(() => {
        const unsubscribe = engine.subscribeToLayoutUpdates((data) => {
            if (data.type === 'hydrate') {
                setLayers(data.layers);
            } else if (data.type === 'upsert_layer') {
                console.log('Receiving upsert_layer', data);
                setLayers((prev) => {
                    // Dedupe logic
                    console.log('Looking at layers');
                    const exists = prev.find((l) => l.numericId === data.numericId);
                    if (exists) return prev;
                    return [...prev, data];
                });
            }
        });
        return unsubscribe;
    }, []);

    // 3. The Animation Loop (Driven by React, executing Engine math)
    useEffect(() => {
        let frameId: number;
        const loop = () => {
            engine.layers.forEach((layer) => {
                if (!layer.el) return;

                // Ask the engine for the math
                const { localX, localY, rot, scale } = engine.calculateCurrentPosition(layer);

                // Apply to DOM (Fast Path)
                layer.el.style.transform = `translate3d(${localX}px, ${localY}px, 0) rotate(${rot}deg) scale(${scale})`;
            });
            frameId = requestAnimationFrame(loop);
        };
        frameId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frameId);
    }, []);

    console.log('layers', layers);

    return (
        <div id="wall">
            {layers.map((l) => (
                <div
                    className="video"
                    style={{ backgroundColor: 'red', minHeight: '30px', minWidth: '30px' }}
                    key={l.numericId}
                    ref={(el) => {
                        if (el) engine.registerLayer(l.numericId, el);
                    }}
                >
                    {/* Content */}
                </div>
            ))}
        </div>
    );
}
