'use client';

import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState, useMemo, type CSSProperties } from 'react';

import { MapWrapper } from '~/components/MapWrapper';
// import { RoyForceGraph } from '~/components/roygraph/RoyForceGraph';
import type { LayerWithWallComponentState } from '~/lib/types';
import { WallEngine, type Viewport } from '~/lib/wallEngine';

// Define the physical screen resolution
const SCREEN_W = 1920;
const SCREEN_H = 1080;

export const Route = createFileRoute('/wall/')({ component: WallApp });

function WallApp() {
    const [layers, setLayers] = useState<LayerWithWallComponentState[]>([]);

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
        if (window.__WALL_RELOADING__) {
            setTimeout(() => {
                engine.sendJSON({ type: 'rehydrate_please' });
            }, 500);
            window.__WALL_RELOADING__ = false;
        }
    }, []);

    useEffect(() => {
        const unsubscribe = engine.subscribeToLayoutUpdates((data) => {
            if (data.type === 'hydrate') setLayers(data.layers);
            else if (data.type === 'upsert_layer') {
                setLayers((prev) => [
                    ...prev.filter((l) => l.numericId !== data.layer.numericId),
                    data.layer
                ]);
            } else if (data.type === 'delete_layer') {
                setLayers((prev) => prev.filter((l) => l.numericId !== data.numericId));
            } else if (data.type === 'reboot') {
                setTimeout(() => window.location.reload(), Math.random() * 1000 + 1000);
            }
        });
        let frameId: number;
        const loop = () => {
            engine.layers.forEach((layer) => {
                if (!layer.el) return;
                // if (!layer.visible) return;

                const pos = engine.calculateCurrentPosition(layer);

                // --- UPGRADED CLIENT-SIDE CULLING MATH (Rotated AABB) ---
                // 1. Get the scaled width and height
                const sw = pos.width * pos.scaleX;
                const sh = pos.height * pos.scaleY;

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
                    const localX = pos.cx - pos.width / 2 - myViewport.x;
                    const localY = pos.cy - pos.height / 2 - myViewport.y;

                    layer.visible = true;
                    layer.el.style.width = `${pos.width}px`;
                    layer.el.style.height = `${pos.height}px`;
                    layer.el.style.transform = `translate3d(${localX}px, ${localY}px, 0) rotate(${pos.rotation}deg) scale(${pos.scaleX}, ${pos.scaleY})`;
                    layer.el.style.opacity = '1';
                } else {
                    layer.visible = false;
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

    const stage = layers.map((layer) => {
        // Share the exact same spatial and registry logic across both media types
        const commonProps = {
            ref: (el: HTMLElement | null) => {
                if (el) engine.registerLayer(layer, el);
            },
            style: {
                position: 'absolute',
                top: 0,
                left: 0,
                transformOrigin: '50% 50%',
                // transition: 'all .1s ease-out',
                width: `${layer.config.width}px`,
                height: `${layer.config.height}px`,
                zIndex: layer.config.zIndex
            } as CSSProperties
        };

        if (layer.type === 'image')
            return (
                <div key={layer.numericId} {...commonProps}>
                    <img
                        src={layer.url}
                        alt={`Layer ${layer.numericId}`}
                        width="100%"
                        height="100%"
                        className="block h-full w-full object-fill"
                    />
                </div>
            );

        if (layer.type === 'text') {
            return <div key={layer.numericId}>{layer.markdown}</div>;
        }

        if (layer.type === 'map') {
            return <MapWrapper key={layer.numericId} {...commonProps} layer={layer} />;
        }

        // if (layer.type === 'graph') {
        //     return <RoyForceGraph key={layer.numericId} {...commonProps} />;
        // }

        if (layer.type === 'video')
            return (
                <video
                    key={layer.numericId}
                    {...commonProps}
                    src={layer.url}
                    muted
                    playsInline
                    loop={layer.loop ?? true}
                />
            );
        return null;
    });

    return (
        <div className="absolute z-50 m-0 block min-h-screen min-w-screen overflow-hidden bg-black">
            {/* Visual Debugger: Shows the Screen ID in the corner */}
            <div
                className="absolute top-2 left-2 z-1000000 border-2 border-red-800 p-2 font-mono text-gray-500 mix-blend-plus-lighter"
                style={{ width: `${SCREEN_W - 2 * 10}px`, height: `${SCREEN_H - 2 * 10}px` }}
            >
                SCREEN&gt; C:{myViewport.x / SCREEN_W} R:{myViewport.y / SCREEN_H}
            </div>
            {stage}
        </div>
    );
}

// --- VITE HMR DEFENSE STRATEGY ---
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        window.__WALL_RELOADING__ = true;
    });
}
