import { createNoise3D } from 'simplex-noise';

import type { BackgroundNoiseLayer } from '~/lib/backgroundNoise';
import { COLS, ROWS, SCREEN_H, SCREEN_W } from '~/lib/stageConstants';

// Static bearing sine (user-provided coefficients):
// y = a * sin((x - h)/b) + k
// Axis mapping requested:
// - x axis unit: 1 SCREEN_H
// - y axis unit: 1 SCREEN_W
const BEARING_A = 2;
const BEARING_H = 8;
const BEARING_B = 6;
const BEARING_K = 0;
// Base gain in row-space; per-line curve scales this progressively.
const BEARING_GAIN_ROWS_BASE = 0.3;

function seededRandom(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hexToRgba(hex: string): [number, number, number, number] {
    const clean = hex.replace(/^#/, '').padEnd(8, 'f');
    return [
        parseInt(clean.slice(0, 2), 16),
        parseInt(clean.slice(2, 4), 16),
        parseInt(clean.slice(4, 6), 16),
        parseInt(clean.slice(6, 8), 16)
    ];
}

function clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function smoothstep(t: number): number {
    const c = clamp01(t);
    return c * c * (3 - 2 * c);
}

function toCssRgba(c: [number, number, number, number], alphaMul = 1): string {
    const a = clamp01((c[3] / 255) * alphaMul);
    return `rgba(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])} / ${a})`;
}

export function renderBackgroundWaves(
    canvas: HTMLCanvasElement,
    layer: BackgroundNoiseLayer,
    col: number,
    row: number,
    t: number,
    colSpan = 1,
    rowSpan = 1
): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    const bg = hexToRgba(layer.backgroundColor);
    const c1 = hexToRgba(layer.motifColor1);
    const c2 = hexToRgba(layer.motifColor2);
    const atmosphere = hexToRgba(layer.atmosphereColor);
    const noise3D = createNoise3D(seededRandom(layer.noiseSeed));

    ctx.fillStyle = toCssRgba(bg);
    ctx.fillRect(0, 0, w, h);

    // Dense ribbon bundle (>=10 lines), packed tightly.
    const waveCount = 60;
    const xStep = 15;
    const phaseT = t * 160;

    const worldStartCol = col;
    const worldStartRow = row;
    const worldSpanCol = Math.max(1e-6, colSpan);
    const worldSpanRow = Math.max(1e-6, rowSpan);

    for (let i = 0; i < waveCount; i++) {
        const depth = i / Math.max(1, waveCount - 1);
        // Tight ribbon clamping: keep lines close in a narrow vertical band.
        const baseWorldYRows = lerp(2.45, 2.95, Math.pow(depth, 1.02));
        const rowColorMix = clamp01(0.08 + depth * 0.85);
        const rowColor: [number, number, number, number] = [
            lerp(c1[0], c2[0], rowColorMix),
            lerp(c1[1], c2[1], rowColorMix),
            lerp(c1[2], c2[2], rowColorMix),
            lerp(c1[3], c2[3], rowColorMix)
        ];
        const waveAlpha =
            lerp(0.4, 0.92, smoothstep(depth)) * (0.55 + (atmosphere[3] / 255) * 0.45);
        ctx.strokeStyle = toCssRgba(rowColor, waveAlpha);
        ctx.lineWidth = lerp(1.2, 2.1, depth);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();

        for (let x = 0; x <= w; x += xStep) {
            const localX01 = x / Math.max(1, w);
            const worldX = worldStartCol + localX01 * worldSpanCol;
            const worldX01 = worldX / COLS;

            // 3D ribbon effect: progressively increase wave excursion per line.
            // Front/deeper lines carry larger amplitude on the same backbone frequencies.
            const ampGain = lerp(1.1, 2.15, Math.pow(depth, 2.05));
            const highFreqGain = lerp(1.35, 8, Math.pow(depth, 2.24));

            // Stronger low-frequency backbone shared by all lines.
            const baseLowA = Math.sin(worldX * 0.11 - phaseT * 0.05 + depth * 0.9);
            const baseLowB = Math.sin(worldX * 0.26 + phaseT * 0.07 + depth * 2.3);
            const low1 = baseLowA * lerp(40, 18, depth) * ampGain;
            const low2 = baseLowB * lerp(34, 15, depth) * ampGain;

            // Mid/high components kept subtler so the low bands dominate the shape.
            const baseAmp = lerp(31, 11, depth) * ampGain;
            const s1 = Math.sin(worldX * 0.72 + phaseT * 0.42 + depth * 5.1) * baseAmp;
            const s2 =
                Math.sin(worldX * 2.35 + phaseT * 0.19 + depth * 9.7) *
                (baseAmp * 0.8 * highFreqGain);
            const s3 =
                Math.sin(worldX * 8.8 - phaseT * 0.11 + depth * 15.3) *
                (baseAmp * 0.1 * highFreqGain * 1.2);

            // Static bearing component (no time dependency) with requested unit mapping.
            // worldX is in SCREEN_W units; convert to SCREEN_H-axis units for x in formula.
            const bearingX = worldX * (SCREEN_W / Math.max(1e-6, SCREEN_H));
            const bearingY = BEARING_A * Math.sin((bearingX - BEARING_H) / BEARING_B) + BEARING_K;
            // Convert bearing y-units (SCREEN_W units) to row units (SCREEN_H units),
            // then apply as a whole-ribbon world-space offset.
            const bearingGainRows =
                BEARING_GAIN_ROWS_BASE * lerp(0.55, 2.15, Math.pow(depth, 1.28));
            const bearingRowOffset =
                (bearingY - BEARING_K) * (SCREEN_W / Math.max(1e-6, SCREEN_H)) * bearingGainRows;
            const worldYRows = baseWorldYRows + bearingRowOffset;
            const worldY01 = worldYRows / ROWS;
            const yBase = ((worldYRows - worldStartRow) / worldSpanRow) * h;

            // Left side slightly higher (smaller y), strongest near top of wave pack.
            const leftLift =
                (1 - worldX01) * (1 - worldX01) * lerp(42, 16, depth) * (1 - worldY01 * 0.4);

            // Static world-scale low frequency: never time-dependent, always biases left higher.
            const staticLeftLowFreq =
                Math.sin(worldX * 0.14 + worldYRows * 0.08 + depth * 1.1) *
                (1 - worldX01) *
                lerp(34, 12, depth);

            const contourNoise =
                noise3D(worldX * 0.72 + 31, worldYRows * 0.58 + 13, t * 0.9) * lerp(5, 2, depth);

            const y =
                yBase - leftLift - staticLeftLowFreq + s1 + s2 + s3 + low1 + low2 + contourNoise;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        ctx.stroke();
    }
}
