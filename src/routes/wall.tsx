import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState, useMemo } from 'react';

import { WallEngine, type Viewport } from '../lib/wallEngine';

// Define your physical screen resolution
const SCREEN_W = 1920;
const SCREEN_H = 1080;

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
            }
        });

        let frameId: number;
        const loop = () => {
            engine.layers.forEach((layer) => {
                if (!layer.el) return;

                const pos = engine.calculateCurrentPosition(layer);

                const w = layer.config.w;
                const h = layer.config.h;

                // --- 2. CLIENT-SIDE CULLING MATH (AABB) ---
                // Calculate the bounding box of the video (including its scale)
                const radiusX = (w / 2) * pos.scale;
                const radiusY = (h / 2) * pos.scale;

                const isVisible =
                    pos.cx + radiusX > myViewport.x && // Right edge is past left screen boundary
                    pos.cx - radiusX < myViewport.x + myViewport.w && // Left edge is past right screen boundary
                    pos.cy + radiusY > myViewport.y && // Bottom edge is past top screen boundary
                    pos.cy - radiusY < myViewport.y + myViewport.h; // Top edge is past bottom screen boundary

                if (isVisible) {
                    // It's on our screen! Calculate local translation and paint.
                    const localX = pos.cx - w / 2 - myViewport.x;
                    const localY = pos.cy - h / 2 - myViewport.y;

                    layer.el.style.transform = `translate3d(${localX}px, ${localY}px, 0) rotate(${pos.rotation}deg) scale(${pos.scale})`;
                    layer.el.style.opacity = '1'; // Ensure it's visible
                } else {
                    // Off-screen. We skip the heavy transform string interpolation.
                    // Optional: hide it to stop the browser from even trying to composite it.
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
                SCREEN C:{myViewport.x / SCREEN_W} R:{myViewport.y / SCREEN_H}
            </div>

            {layers.map((layer) => (
                <video
                    key={layer.numericId}
                    src={layer.url}
                    muted
                    playsInline
                    ref={(el) => {
                        if (el)
                            engine.registerLayer(layer.numericId, layer.config, layer.playback, el);
                    }}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        transformOrigin: '50% 50%',
                        width: `${layer.config.w}px`,
                        height: `${layer.config.h}px`,
                        zIndex: layer.config.zIndex || 1
                    }}
                />
            ))}
        </div>
    );
}

export const Route = createFileRoute('/wall')({ component: WallApp });
