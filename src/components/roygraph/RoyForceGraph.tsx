'use client';

import { throttle } from '@tanstack/pacer';
import * as BSON from 'bson';
import {
    useEffect,
    useRef,
    type CanvasHTMLAttributes,
    type FC,
    type PropsWithChildren,
    type RefAttributes
} from 'react';
import { z } from 'zod';

import { setRefs } from '@/lib/setRefs';

import { useWS } from './useWS';

const RoyGraphServerFrameSchema = z.object({
    ids: z.array(z.number()),
    xs: z.array(z.number()),
    ys: z.array(z.number()),
    srcs: z.array(z.number()),
    tgts: z.array(z.number())
});

export type RoyGraphServerFrame = z.infer<typeof RoyGraphServerFrameSchema>;

function getCameraFromURL() {
    const params = new URLSearchParams(window.location.search);

    const cx = Number(params.get('cx'));
    const cy = Number(params.get('cy'));
    const zoom = Number(params.get('z'));

    return {
        cx: Number.isFinite(cx) ? cx : 50,
        cy: Number.isFinite(cy) ? cy : 500,
        zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 0.2
    };
}

let camera = getCameraFromURL();

const cssWidth = 1080;
const cssHeight = 1080;

const GRID_SIZE = 50;

const computeRange = () => {
    const worldW = cssWidth / camera.zoom;
    const worldH = cssHeight / camera.zoom;

    const pad = GRID_SIZE;

    const left = camera.cx - worldW / 2 - pad;
    const right = camera.cx + worldW / 2 + pad;
    const top = camera.cy - worldH / 2 - pad;
    const bottom = camera.cy + worldH / 2 + pad;

    const gx0 = Math.floor(left / GRID_SIZE);
    const gx1 = Math.floor(right / GRID_SIZE);
    const gy0 = Math.floor(top / GRID_SIZE);
    const gy1 = Math.floor(bottom / GRID_SIZE);

    return { gx0, gx1, gy0, gy1 };
};

let globalCanvasRef: HTMLCanvasElement | null = null;
let globalContext: CanvasRenderingContext2D | null = null;

export const RoyForceGraph: FC<
    PropsWithChildren<
        RefAttributes<HTMLCanvasElement> & Partial<CanvasHTMLAttributes<HTMLCanvasElement>>
    >
> = ({ ref, ...props }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ws = useWS();

    const handleMessage = throttle(
        (event: MessageEvent) => {
            if (!event.data) return;

            const bytes = new Uint8Array(event.data as ArrayBuffer);
            // We do not parse here to avoid performance hit. We cast directly as blind-trust
            const packed =
                bytes.length >= 5 ? (BSON.deserialize(bytes) as RoyGraphServerFrame) : null;
            if (!packed) return;

            const nodes = packed.ids.map((id, i) => ({
                id: String(id),
                x: packed.xs[i] * 2 - cssWidth / 2,
                y: packed.ys[i] * 2 - cssHeight / 2,
                group: 1
            }));

            const links = packed.srcs.map((src, i) => ({
                source: String(src),
                target: String(packed.tgts[i]),
                value: 1
            }));

            if (!globalCanvasRef) return;
            if (!globalContext) {
                globalContext = globalCanvasRef.getContext('2d');
                globalCanvasRef.width = cssWidth;
                globalCanvasRef.height = cssHeight;
            }

            const context = globalContext!;

            context.clearRect(0, 0, globalCanvasRef.width, globalCanvasRef.height);

            // Draw links
            links.forEach((d) => {
                const source = nodes.find((n) => n.id === d.source);
                const target = nodes.find((n) => n.id === d.target);
                // We could also bblind-trust here and avoid the checks for performance gains
                if (
                    source &&
                    target &&
                    source.x !== undefined &&
                    source.y !== undefined &&
                    target.x !== undefined &&
                    target.y !== undefined
                ) {
                    const gradient = context.createLinearGradient(
                        source.x,
                        source.y,
                        target.x,
                        target.y
                    );
                    gradient.addColorStop(0, '#fff5');
                    gradient.addColorStop(0.4, '#aaa5');
                    gradient.addColorStop(1, 'red');
                    context.beginPath();
                    context.strokeStyle = gradient;
                    context.moveTo(source.x, source.y);
                    context.lineTo(target.x, target.y);
                    context.lineWidth = 1;
                    context.stroke();
                }
            });

            // Draw nodes
            nodes.forEach((d) => {
                context.beginPath();
                if (d.x && d.y) {
                    context.moveTo(d.x, d.y);
                    context.arc(d.x, d.y, 2.5, 0, 2 * Math.PI);
                }
                context.fillStyle = 'white';
                context.fill();
                context.lineWidth = 0;
            });
        },
        { wait: 50 }
    );

    useEffect(() => {
        if (!canvasRef.current) return;

        let isConnected = true;
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    switch ((mutation.target as HTMLCanvasElement).style.opacity) {
                        case '0':
                            if (!isConnected) return;
                            console.log('Disconnecting Roy WebSocket');
                            isConnected = false;
                            ws?.removeEventListener('message', handleMessage);
                            break;
                        case '1':
                            if (isConnected) return;
                            console.log('Reconnecting Roy WebSocket');
                            isConnected = true;
                            ws?.addEventListener('message', handleMessage);
                            break;
                    }
                }
            });
        });

        observer.observe(canvasRef.current, { attributes: true });
        return () => {
            observer.disconnect();
        };
    });

    useEffect(() => {
        globalCanvasRef = canvasRef.current;

        if (!ws) return;

        const requestSnapshot = () => {
            const range = computeRange();
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'range', ...range }));
            }
        };

        ws.addEventListener('message', handleMessage);

        let interval: number | undefined;

        const handleOpen = () => {
            requestSnapshot();
            interval = window.setInterval(requestSnapshot, 50);
        };

        if (ws.readyState === WebSocket.OPEN) {
            handleOpen();
        } else {
            ws.addEventListener('open', handleOpen);
        }

        const handlePopState = () => {
            const updated = getCameraFromURL();
            camera = updated;
            requestSnapshot();
        };

        window.addEventListener('popstate', handlePopState);

        return () => {
            if (interval) window.clearInterval(interval);

            ws.removeEventListener('message', handleMessage);
            ws.removeEventListener('open', handleOpen);

            window.removeEventListener('popstate', handlePopState);
        };
    }, [ws]);

    return (
        <canvas
            id="roy-force-graph-host"
            {...props}
            ref={(node) => {
                canvasRef.current = node;
                setRefs(node, ref);
            }}
        />
    );
};
