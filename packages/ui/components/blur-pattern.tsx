import { useDebouncedCallback } from '@tanstack/react-pacer';
import React, { useEffect, useRef } from 'react';

type Blob = {
    x: number;
    y: number;
    r: number;
    a: number;
    hue: number;
};

type Props = {
    seed: string;
    width?: number;
    height?: number;
    blobs?: number;
};

function hashString(str: string) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function createRNG(seed: number) {
    let s = seed;
    return () => {
        s = Math.imul(1664525, s) + 1013904223;
        return (s >>> 0) / 4294967296;
    };
}

function generateBlobs(seed: string, count: number, w: number, h: number): Blob[] {
    const rand = createRNG(hashString(seed));

    return new Array(count).fill(null).map(() => ({
        x: rand() * w,
        y: rand() * h,
        r: w * (0.25 + rand() * 0.35),
        hue: rand() * 360,
        a: 1
    }));
}

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

function easeOutCubic(t: number) {
    return 1 - Math.pow(1 - t, 3);
}

export default function AnimatedBlurPattern({ seed, width = 400, height = 400, blobs = 6 }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const currentBlobs = useRef<Blob[]>([]);
    const targetBlobs = useRef<Blob[]>([]);
    const animFrame = useRef<number>(0);

    const draw = (ctx: CanvasRenderingContext2D, blobs: Blob[]) => {
        ctx.clearRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'color-dodge';
        ctx.filter = 'blur(50px)';

        for (const b of blobs) {
            const gradient = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);

            gradient.addColorStop(0, `hsla(${b.hue},85%,60%,${b.a})`);
            gradient.addColorStop(1, 'transparent');

            ctx.fillStyle = gradient;

            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fill();
        }
    };

    const animate = (ctx: CanvasRenderingContext2D, start: Blob[], end: Blob[]) => {
        const duration = 900;
        const startTime = performance.now();

        const frame = (t: number) => {
            const raw = Math.min((t - startTime) / duration, 1);
            const progress = easeOutCubic(raw);

            const interpolated = start.map((s, i) => ({
                x: lerp(s.x, end[i].x, progress),
                y: lerp(s.y, end[i].y, progress),
                r: lerp(s.r, end[i].r, progress),
                a: lerp(s.a, end[i].a, progress),
                hue: lerp(s.hue, end[i].hue, progress)
            }));

            draw(ctx, interpolated);

            if (raw < 1) {
                animFrame.current = requestAnimationFrame(frame);
            } else {
                currentBlobs.current = end;
            }
        };

        cancelAnimationFrame(animFrame.current!);
        animFrame.current = requestAnimationFrame(frame);
    };

    const updateSeed = useDebouncedCallback(
        (newSeed: string) => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const next = generateBlobs(newSeed, blobs, width, height);

            if (currentBlobs.current.length === 0) {
                currentBlobs.current = next.map((b) => ({ ...b, a: 0 }));
                draw(ctx, currentBlobs.current);
                // oxlint-disable-next-line
                updateSeed?.(newSeed);
                return;
            }

            targetBlobs.current = next;
            animate(ctx, currentBlobs.current, targetBlobs.current);
        },
        { wait: 300 }
    );

    useEffect(() => {
        updateSeed(seed);
    }, [seed, updateSeed]);

    return <canvas ref={canvasRef} width={width} height={height} />;
}
