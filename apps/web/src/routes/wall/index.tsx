'use client';

import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState, useMemo, type CSSProperties } from 'react';

import { MapWrapper } from '~/components/MapWrapper';
// import { RoyForceGraph } from '~/components/roygraph/RoyForceGraph';
import { toCssFilterString } from '~/lib/layerFilters';
import { TEXT_BASE_STYLE } from '~/lib/textRenderConfig';
import type { LayerWithWallComponentState } from '~/lib/types';
import { WallEngine, type Viewport } from '~/lib/wallEngine';

// Define the physical screen resolution
const SCREEN_W = 1920;
const SCREEN_H = 1080;

export const Route = createFileRoute('/wall/')({
    component: WallApp
});

function WallApp() {
    const [layers, setLayers] = useState<LayerWithWallComponentState[]>([]);
    const [frameabilityByUrl, setFrameabilityByUrl] = useState<
        Record<string, { ok: boolean; reason?: string; fallback?: string }>
    >({});
    const isClient = typeof window !== 'undefined';
    const wallId = useMemo(() => {
        if (!isClient) return null;
        const params = new URLSearchParams(window.location.search);
        return params.get('w');
    }, [isClient]);

    const myViewport = useMemo<Viewport>(() => {
        if (!isClient) return { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H };
        const params = new URLSearchParams(window.location.search);
        const col = parseInt(params.get('c') || '0');
        const row = parseInt(params.get('r') || '0');

        return { x: col * SCREEN_W, y: row * SCREEN_H, w: SCREEN_W, h: SCREEN_H };
    }, [isClient]);

    // Initialize Engine with this screen's specific physical location
    const engine = useMemo(
        () => (wallId ? WallEngine.getInstance(wallId, myViewport) : null),
        [wallId, myViewport]
    );

    useEffect(() => {
        if (window.__WALL_RELOADING__) {
            setTimeout(() => {
                engine?.sendJSON({ type: 'rehydrate_please' });
            }, 500);
            window.__WALL_RELOADING__ = false;
        }
    }, [engine]);

    useEffect(() => {
        const unsubscribe = engine?.subscribeToLayoutUpdates((data) => {
            if (data.type === 'hydrate') setLayers(data.layers);
            else if (data.type === 'upsert_layer') {
                setLayers((prev) => {
                    const existing = prev.find((l) => l.numericId === data.layer.numericId);
                    const nextLayer =
                        existing?.type === 'video' && data.layer.type === 'video'
                            ? { ...data.layer, playback: existing.playback ?? data.layer.playback }
                            : data.layer;
                    return [...prev.filter((l) => l.numericId !== data.layer.numericId), nextLayer];
                });
            } else if (data.type === 'delete_layer') {
                setLayers((prev) => prev.filter((l) => l.numericId !== data.numericId));
            } else if (data.type === 'reboot') {
                setTimeout(() => window.location.reload(), Math.random() * 1000 + 1000);
            }
        });
        let frameId: number;
        const loop = () => {
            engine?.layers.forEach((layer) => {
                if (!layer.el) return;
                if (!layer.config.visible) {
                    layer.el.style.opacity = '0';
                    layer.visible = false;
                    return;
                }

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
            unsubscribe?.();
            cancelAnimationFrame(frameId);
        };
    }, [engine, myViewport]);

    useEffect(() => {
        const urlsToCheck = Array.from(
            new Set(
                layers.flatMap((layer) => {
                    if (
                        layer.type !== 'web' ||
                        layer.proxy === true ||
                        typeof layer.url !== 'string' ||
                        !/^https?:\/\//i.test(layer.url)
                    ) {
                        return [];
                    }
                    return [layer.url.trim()];
                })
            )
        ).filter((url) => frameabilityByUrl[url] === undefined);

        if (urlsToCheck.length === 0) return;

        let cancelled = false;
        for (const url of urlsToCheck) {
            fetch(`/proxy?check=1&url=${encodeURIComponent(url)}`)
                .then((res) => res.json())
                .then((data: { ok?: boolean; reason?: string; fallback?: string }) => {
                    if (cancelled) return;
                    setFrameabilityByUrl((prev) => {
                        if (prev[url] !== undefined) return prev;
                        return {
                            ...prev,
                            [url]: {
                                ok: data.ok === true,
                                reason: data.reason,
                                fallback: data.fallback
                            }
                        };
                    });
                })
                .catch(() => {
                    if (cancelled) return;
                    setFrameabilityByUrl((prev) => {
                        if (prev[url] !== undefined) return prev;
                        return {
                            ...prev,
                            [url]: {
                                ok: false,
                                reason: 'network_error',
                                fallback: '/web-nonet?l=wall'
                            }
                        };
                    });
                });
        }

        return () => {
            cancelled = true;
        };
    }, [layers, frameabilityByUrl]);

    if (!engine) return null;

    const stage = layers
        .filter((layer) => layer.config.visible)
        .map((layer) => {
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
                    filter: toCssFilterString(layer.config.filters),
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
                return (
                    <div
                        key={layer.numericId}
                        {...commonProps}
                        style={{
                            ...commonProps.style,
                            ...TEXT_BASE_STYLE,
                            overflow: 'hidden'
                        }}
                        dangerouslySetInnerHTML={{ __html: layer.textHtml }}
                    />
                );
            }

            if (layer.type === 'map') {
                return <MapWrapper key={layer.numericId} {...commonProps} layer={layer} />;
            }

            if (layer.type === 'web') {
                const webScale = layer.scale || 1;
                const shouldProxy =
                    layer.proxy === true && !!layer.url && /^https?:\/\//i.test(layer.url);
                const normalizedUrl = (layer.url ?? '').trim();
                const hasUsableUrl = !!normalizedUrl && /^https?:\/\//i.test(normalizedUrl);
                const frameability =
                    hasUsableUrl && layer.proxy !== true
                        ? (frameabilityByUrl[normalizedUrl] ?? null)
                        : null;
                const fallbackFromPrecheck =
                    frameability && !frameability.ok
                        ? (frameability.fallback ?? '/web-nonet?l=wall')
                        : null;
                const iframeSrc = shouldProxy
                    ? `/proxy?url=${encodeURIComponent(normalizedUrl)}`
                    : hasUsableUrl && frameability === null
                      ? '/web-placeholder?l=wall'
                      : hasUsableUrl && frameability?.ok === true
                        ? normalizedUrl
                        : (fallbackFromPrecheck ?? '/web-nonet?l=wall');
                const iframeProps = {
                    ref: commonProps.ref,
                    style: {
                        ...commonProps.style,
                        width: `${layer.config.width / webScale}px`,
                        height: `${layer.config.height / webScale}px`,
                        transform: `scale(${webScale})`,
                        transformOrigin: '0 0'
                    }
                };
                return (
                    <iframe
                        key={layer.numericId}
                        {...iframeProps}
                        src={iframeSrc}
                        title={`Web layer ${layer.numericId}`}
                        sandbox="allow-scripts allow-same-origin"
                        onError={(e) => {
                            const iframe = e.currentTarget;
                            if (
                                !iframe.src.includes('/web-nonet') &&
                                !iframe.src.includes('/web-corsissue')
                            ) {
                                iframe.src = '/web-nonet?l=wall';
                            }
                        }}
                        className="bg-background"
                    />
                );
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
                        className="object-cover"
                    />
                );

            if (layer.type === 'line') {
                let svgPoints = [];
                for (let i = 0; i < layer.line.length; i += 2)
                    svgPoints.push(
                        `${Math.round(layer.line[i] - layer.config.cx + layer.config.width / 2)},${Math.round(layer.line[i + 1] - layer.config.cy + layer.config.height / 2)}`
                    );
                return (
                    <div key={layer.numericId} {...commonProps} className="origin-top-left">
                        <svg
                            width={layer.config.width * 1.5}
                            height={layer.config.height * 1.5}
                            className="overflow-visible"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <polyline
                                points={svgPoints.join(' ')}
                                fill="none"
                                stroke={layer.strokeColor}
                                strokeWidth={layer.strokeWidth}
                                strokeDasharray={layer.strokeDash.join(' ')}
                                strokeDashoffset={(layer.strokeDash[0] ?? 0) / 2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </div>
                );
            }

            if (layer.type === 'shape') {
                if (layer.shape === 'rectangle')
                    return (
                        <div key={layer.numericId} {...commonProps}>
                            <svg
                                width={layer.config.width}
                                height={layer.config.height}
                                className="overflow-visible"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <rect
                                    x={0}
                                    y={0}
                                    width={layer.config.width}
                                    height={layer.config.height}
                                    fill={layer.fill}
                                    stroke={layer.strokeColor}
                                    strokeDasharray={layer.strokeDash.join(' ')}
                                    strokeDashoffset={(layer.strokeDash[0] ?? 0) / 2}
                                    strokeWidth={layer.strokeWidth}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    overflow="visible"
                                    //    rx=""
                                />
                            </svg>
                        </div>
                    );

                if (layer.shape === 'circle')
                    return (
                        <div key={layer.numericId} {...commonProps} className="origin-top-left">
                            <svg
                                width={layer.config.width}
                                height={layer.config.height}
                                className="overflow-visible"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <circle
                                    cx={0}
                                    cy={0}
                                    r={layer.config.width / 2}
                                    fill={layer.fill}
                                    stroke={layer.strokeColor}
                                    strokeDasharray={layer.strokeDash.join(' ')}
                                    strokeWidth={layer.strokeWidth}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    overflow="visible"
                                />
                            </svg>
                        </div>
                    );
            }
            return null;
        });

    return (
        <div className="absolute z-50 m-0 block min-h-screen min-w-screen overflow-hidden bg-black">
            {/* Visual Debugger: Shows the Screen ID in the corner */}
            <div
                className="min-blend-plus-lighter absolute top-2 left-2 z-1000000 border-2 border-red-800 p-2 font-mono text-gray-500"
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
