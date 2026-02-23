import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState, useMemo } from 'react';

import { WallEngine, type Viewport } from '../lib/wallEngine';

// Define your physical screen resolution
const SCREEN_W = 1920;
const SCREEN_H = 1080;

export const Route = createFileRoute('/wall')({ component: WallApp });

function WallApp() {
    const [layers, setLayers] = useState<any[]>([]);

    // 1. Parse URL Parameters: ?c=0&r=1
    const myViewport = useMemo<Viewport>(() => {
        const params = new URLSearchParams(window.location.search);
        const col = parseInt(params.get('c') || '0');
        const row = parseInt(params.get('r') || '0');

        return { x: col * SCREEN_W, y: row * SCREEN_H, w: SCREEN_W, h: SCREEN_H };
    }, []);

    // Initialize Engine with this screen's specific physical location
    const engine = useMemo(() => WallEngine.getInstance(myViewport), [myViewport]);

    useEffect(() => {
        const unsubscribe = engine.subscribeToLayoutUpdates((data) => {
            if (data.type === 'hydrate') setLayers(data.layers);
            else if (data.type === 'upsert_layer') {
                setLayers((prev) => [...prev.filter((l) => l.numericId !== data.numericId), data]);
            } else if (data.type === 'delete_layer') {
                setLayers((prev) => prev.filter((l) => l.numericId !== data.numericId));
            }
        });

        let frameId: number;
        const loop = () => {
            engine.layers.forEach((layer) => {
                if (!layer.el) return;

                const pos = engine.calculateCurrentPosition(layer);

                // --- UPGRADED CLIENT-SIDE CULLING MATH (Rotated AABB) ---
                // 1. Get the scaled width and height
                const sw = layer.config.w * pos.scale;
                const sh = layer.config.h * pos.scale;

                // 2. Convert degrees to radians for JS Math functions
                const rad = pos.rotation * (Math.PI / 180);

                // 3. Calculate the true dynamic bounding box of the rotated rectangle
                const radiusX =
                    (sw / 2) * Math.abs(Math.cos(rad)) + (sh / 2) * Math.abs(Math.sin(rad)) + 20;
                const radiusY =
                    (sw / 2) * Math.abs(Math.sin(rad)) + (sh / 2) * Math.abs(Math.cos(rad)) + 20;

                // Protect against network NaN poisoning
                if (isNaN(radiusX) || isNaN(radiusY)) return;

                // 4. Evaluate against the screen viewport
                const isVisible =
                    pos.cx + radiusX > myViewport.x &&
                    pos.cx - radiusX < myViewport.x + myViewport.w &&
                    pos.cy + radiusY > myViewport.y &&
                    pos.cy - radiusY < myViewport.y + myViewport.h;

                if (isVisible) {
                    const localX = pos.cx - layer.config.w / 2 - myViewport.x;
                    const localY = pos.cy - layer.config.h / 2 - myViewport.y;

                    layer.el.style.transform = `translate3d(${localX}px, ${localY}px, 0) rotate(${pos.rotation}deg) scale(${pos.scale})`;
                    layer.el.style.opacity = '1';
                } else {
                    layer.el.style.opacity = '0';
                }
            });
            frameId = requestAnimationFrame(loop);
        };

        frameId = requestAnimationFrame(loop);
        return () => {
            unsubscribe();
            cancelAnimationFrame(frameId);
        };
    }, [engine, myViewport]);

    return (
        <div
            style={{
                margin: 0,
                overflow: 'hidden',
                background: '#000',
                width: '100vw',
                height: '100vh',
                position: 'relative'
                // scale: 0.5,
                // transformOrigin: 'top left'
            }}
        >
            {/* Visual Debugger: Shows the Screen ID in the corner */}
            <div
                style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    color: 'rgba(255,255,255,0.3)',
                    zIndex: 9999,
                    border: '3px solid red',
                    width: `${SCREEN_W}px`,
                    height: `${SCREEN_H}px`,
                    fontFamily: 'monospace'
                }}
            >
                SCREEN&gt; C:{myViewport.x / SCREEN_W} R:{myViewport.y / SCREEN_H}
            </div>
            {layers.map((layer) => {
                // Share the exact same spatial and registry logic across both media types
                const commonProps = {
                    key: layer.numericId,
                    src: layer.url,
                    ref: (el: HTMLElement | null) => {
                        if (el)
                            engine.registerLayer(layer.numericId, layer.config, layer.playback, el);
                    },
                    style: {
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        transformOrigin: '50% 50%',
                        width: `${layer.config.w}px`,
                        height: `${layer.config.h}px`,
                        zIndex: layer.config.zIndex || 1
                    } as React.CSSProperties
                };

                if (layer.layerType === 'image') {
                    return (
                        <img {...commonProps} alt={`Layer ${layer.numericId}`} draggable={false} />
                    );
                }

                // Otherwise, mount the full hardware-accelerated video tag
                return (
                    <video {...commonProps} muted playsInline loop={layer.config.loop ?? true} />
                );
            })}
        </div>
    );
}
