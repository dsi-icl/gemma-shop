import { createNoise3D } from 'simplex-noise';

export const BACKGROUND_RENDER_W = 384;
export const BACKGROUND_RENDER_H = 216;

/** Advance per second in noise time — controls how slowly the pattern drifts. */
export const BACKGROUND_T_SPEED = 0.0015;

/** How often the canvas redraws (ms). Small enough to look smooth, large enough to be cheap. */
export const BACKGROUND_TICK_MS = 2_000;

export interface BackgroundNoiseLayer {
    backgroundColor: string;
    atmosphereColor: string;
    motifColor1: string;
    motifColor2: string;
    noiseSeed: number;
    speedFactor: number;
}

/** Seeded PRNG (mulberry32) — used to seed simplex-noise deterministically. */
export function seededRandom(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Parse a 6- or 8-digit hex colour string into [r, g, b, a] (0-255 each). */
function hexToRgba(hex: string): [number, number, number, number] {
    const clean = hex.replace(/^#/, '').padEnd(8, 'f');
    const rr = clean.slice(0, 2);
    const gg = clean.slice(2, 4);
    const bb = clean.slice(4, 6);
    const aa = clean.slice(6, 8);
    return [parseInt(rr, 16), parseInt(gg, 16), parseInt(bb, 16), parseInt(aa, 16)];
}

/** Smooth Hermite interpolation — softens blend edges. */
function smoothstep(t: number): number {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
}

/**
 * Renders a simplex-noise background frame onto `canvas`.
 *
 * `col` and `row` place this screen in the wall's noise coordinate space so
 * adjacent screens tile seamlessly.  All screens sharing the same `layer.noiseSeed`
 * use the same noise function — spatial coordinates alone drive continuity.
 *
 * `colSpan` and `rowSpan` control how many screens worth of noise space the
 * canvas covers.  Use 1/1 (default) for per-screen wall rendering.  Use
 * COLS/ROWS for the editor Konva preview so the full wall aspect ratio is shown.
 *
 * @param t  Slow-moving time axis value.  Advance by BACKGROUND_T_SPEED per second.
 */
export function renderBackgroundNoise(
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

    // All screens share the same noise function — no col/row in the seed.
    // Spatial coords (nx, ny) place each pixel in wall space for seamless tiling.
    const noise3D = createNoise3D(seededRandom(layer.noiseSeed));

    const bg = hexToRgba(layer.backgroundColor);
    const atm = hexToRgba(layer.atmosphereColor);
    const m1 = hexToRgba(layer.motifColor1);
    const m2 = hexToRgba(layer.motifColor2);

    // Pre-normalise alphas to [0, 1] so they act as blend multipliers.
    const atmA = atm[3] / 255;
    const m1A = m1[3] / 255;
    const m2A = m2[3] / 255;

    const w = canvas.width;
    const h = canvas.height;
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;

    for (let y = 0; y < h; y++) {
        // Map to wall noise space: col=0,x=0 → nx=0; col=1,x=0 → nx=1; seamless at boundary.
        const ny = row + (y / h) * rowSpan;
        for (let x = 0; x < w; x++) {
            const nx = col + (x / w) * colSpan;

            // Layer 1: large-blob base wash (low spatial frequency = big smooth areas).
            // Atmosphere alpha scales how strongly it can wash over the background.
            const n1 = (noise3D(nx * 0.9, ny * 0.6, t) + 1) / 2;
            const wash = smoothstep(n1) * atmA;
            const r0 = bg[0] + (atm[0] - bg[0]) * wash;
            const g0 = bg[1] + (atm[1] - bg[1]) * wash;
            const b0 = bg[2] + (atm[2] - bg[2]) * wash;

            // Layer 2: medium motif overlay (slightly higher frequency, offset phase).
            // Each motif colour's alpha caps its maximum blend contribution.
            const n2 = (noise3D(nx * 2.0 + 30, ny * 1.4 + 30, t * 0.6) + 1) / 2;
            let r = r0,
                g = g0,
                b = b0;
            if (n2 > 0.6) {
                const blend = smoothstep((n2 - 0.6) / 0.4) * m1A;
                r = r0 + (m1[0] - r0) * blend;
                g = g0 + (m1[1] - g0) * blend;
                b = b0 + (m1[2] - b0) * blend;
            } else if (n2 < 0.4) {
                const blend = smoothstep((0.4 - n2) / 0.4) * m2A;
                r = r0 + (m2[0] - r0) * blend;
                g = g0 + (m2[1] - g0) * blend;
                b = b0 + (m2[2] - b0) * blend;
            }

            const i = (y * w + x) * 4;
            data[i] = Math.round(r);
            data[i + 1] = Math.round(g);
            data[i + 2] = Math.round(b);
            // Background colour alpha controls overall canvas opacity.
            data[i + 3] = bg[3];
        }
    }

    ctx.putImageData(imageData, 0, 0);
}
