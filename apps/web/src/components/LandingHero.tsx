import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { selectAssetVariantSrc } from '@repo/ui/lib/assetVariants';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

// Arc length = radius(10) × degToRad(313) ≈ 54.6
// Surface aspect ≈ 9.1:1, so 2560 / 9.1 ≈ 281
const MOSAIC_W = 2560;
const MOSAIC_H = Math.round(MOSAIC_W * (6 / (10 * THREE.MathUtils.degToRad(313))));

const GRID_COLS = 16;
const GRID_ROWS = 4;
const CELL_COUNT = GRID_COLS * GRID_ROWS;
const CELL_W = MOSAIC_W / GRID_COLS;
const CELL_H = MOSAIC_H / GRID_ROWS;
const FADE_RATE = 0.4; // opacity units per second
const DRAW_FPS = 24;
const DRAW_INTERVAL = 1 / DRAW_FPS;
const FILL_RATIO = 0.4; // fraction of cells that get an image at all
const PATTERN_MIX_RATIO = 0.35; // within active cells, fraction rendered as blur-pattern tiles

interface CellState {
    image: HTMLImageElement | null;
    fallback: boolean;
    hue: number;
    patternPoints: PatternPoint[];
    targetOpacity: number; // 0 or 1
    currentOpacity: number; // lerped
    nextToggleAt: number; // timestamp when this cell next changes state
    sx: number;
    sy: number;
    sw: number;
    sh: number;
}

interface PatternPoint {
    ox: number;
    oy: number;
    hueShift: number;
    hueDriftAmp: number;
    hueDriftSpeed: number;
    hueDriftPhase: number;
    inner: number;
    outer: number;
    strength: number;
}

function computeCoverCrop(image: HTMLImageElement, cellW: number, cellH: number) {
    const imgAspect = image.naturalWidth / image.naturalHeight;
    const cellAspect = cellW / cellH;
    if (imgAspect > cellAspect) {
        const sh = image.naturalHeight;
        const sw = sh * cellAspect;
        return { sx: (image.naturalWidth - sw) / 2, sy: 0, sw, sh };
    }
    const sw = image.naturalWidth;
    const sh = sw / cellAspect;
    return { sx: 0, sy: (image.naturalHeight - sh) / 2, sw, sh };
}

function createPatternPoints(): PatternPoint[] {
    return Array.from({ length: 3 }, () => {
        let ox = 0.16 + Math.random() * 0.68;
        let oy = 0.18 + Math.random() * 0.64;
        // Keep blobs meaningfully off-centre.
        if (Math.abs(ox - 0.5) + Math.abs(oy - 0.5) < 0.22) {
            ox = ox < 0.5 ? ox - 0.12 : ox + 0.12;
            oy = oy < 0.5 ? oy - 0.12 : oy + 0.12;
        }
        return {
            ox: Math.min(0.9, Math.max(0.1, ox)),
            oy: Math.min(0.9, Math.max(0.1, oy)),
            hueShift: -90 + Math.random() * 240,
            hueDriftAmp: 10 + Math.random() * 30,
            hueDriftSpeed: 0.00035 + Math.random() * 0.00055,
            hueDriftPhase: Math.random() * Math.PI * 2,
            inner: 0.04 + Math.random() * 0.05,
            outer: 0.5 + Math.random() * 0.24,
            strength: 0.62 + Math.random() * 0.34
        };
    });
}

function assignRandomTileContent(
    cell: CellState,
    images: HTMLImageElement[],
    patternMixRatio: number,
    cellW: number,
    cellH: number
) {
    const usePattern = images.length === 0 || Math.random() < patternMixRatio;
    cell.hue = Math.random() * 360;

    if (usePattern) {
        cell.image = null;
        cell.fallback = true;
        cell.patternPoints = createPatternPoints();
        cell.sx = 0;
        cell.sy = 0;
        cell.sw = 0;
        cell.sh = 0;
        return;
    }

    const img = images[Math.floor(Math.random() * images.length)];
    if (!img.naturalWidth || !img.naturalHeight) {
        cell.image = null;
        cell.fallback = true;
        cell.patternPoints = createPatternPoints();
        cell.sx = 0;
        cell.sy = 0;
        cell.sw = 0;
        cell.sh = 0;
        return;
    }

    const crop = computeCoverCrop(img, cellW, cellH);
    cell.image = img;
    cell.fallback = false;
    cell.patternPoints = [];
    cell.sx = crop.sx;
    cell.sy = crop.sy;
    cell.sw = crop.sw;
    cell.sh = crop.sh;
}

function drawMosaic(
    ctx: CanvasRenderingContext2D,
    cells: CellState[],
    cols: number,
    rows: number,
    staticLayer: HTMLCanvasElement
) {
    const cellW = MOSAIC_W / cols;
    const cellH = MOSAIC_H / rows;
    const time = performance.now();
    ctx.globalAlpha = 1;
    ctx.drawImage(staticLayer, 0, 0);

    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (cell.currentOpacity < 0.01) continue;

        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * cellW;
        const y = row * cellH;

        if (cell.image) {
            const img = cell.image;
            if (!img.naturalWidth || !img.naturalHeight) continue;
            ctx.globalAlpha = cell.currentOpacity;
            ctx.drawImage(img, cell.sx, cell.sy, cell.sw, cell.sh, x, y, cellW, cellH);
            continue;
        }

        if (!cell.fallback) continue;

        const alpha = Math.min(0.9, cell.currentOpacity);
        const points = cell.patternPoints.length > 0 ? cell.patternPoints : createPatternPoints();

        for (let p = 0; p < points.length; p++) {
            const point = points[p];
            const cx = x + cellW * point.ox;
            const cy = y + cellH * point.oy;
            const glow = ctx.createRadialGradient(
                cx,
                cy,
                cellW * point.inner,
                cx,
                cy,
                cellW * point.outer
            );
            const drift =
                Math.sin(time * point.hueDriftSpeed + point.hueDriftPhase) * point.hueDriftAmp;
            const startHue = (cell.hue + point.hueShift + drift + 360) % 360;
            const edgeHue = (startHue + 36) % 360;
            glow.addColorStop(0, `hsla(${startHue}, 92%, 64%, ${alpha * point.strength})`);
            glow.addColorStop(1, `hsla(${edgeHue}, 86%, 44%, 0)`);
            ctx.fillStyle = glow;
            ctx.fillRect(x, y, cellW, cellH);
        }
    }
}

const VIEW_ANGLE = 313;
const GAP_ANGLE = 360 - VIEW_ANGLE;

function MosaicCylinder({
    heroImages,
    radius = 10,
    height = 6
}: {
    heroImages: { src: string; sizes?: number[] }[];
    radius?: number;
    height?: number;
}) {
    const gl = useThree((s) => s.gl);
    const textureRef = useRef<THREE.CanvasTexture | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const staticLayerRef = useRef<HTMLCanvasElement | null>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const cellsRef = useRef<CellState[]>([]);
    const loadedImagesRef = useRef<HTMLImageElement[]>([]);
    const patternMixRatioRef = useRef(PATTERN_MIX_RATIO);
    const elapsedRef = useRef(0);
    const [ready, setReady] = useState(false);

    const imageKey = useMemo(() => heroImages.map((h) => h.src).join(','), [heroImages]);

    // Load images and initialise cell state
    useEffect(() => {
        const useFallbackOnly = heroImages.length === 0;
        patternMixRatioRef.current = useFallbackOnly ? 1 : PATTERN_MIX_RATIO;
        // Only assign content to a subset of cells.
        // With no images we fill every tile with blur-pattern content.
        const fillCount = useFallbackOnly ? CELL_COUNT : Math.round(CELL_COUNT * FILL_RATIO);
        const shuffled = Array.from({ length: CELL_COUNT }, (_, i) => i);
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const activeCellIds = shuffled.slice(0, fillCount);
        const activeCells = new Set(activeCellIds);

        const patternCells = new Set<number>();
        if (useFallbackOnly) {
            for (const id of activeCellIds) patternCells.add(id);
        } else {
            const patternCount = Math.round(fillCount * PATTERN_MIX_RATIO);
            for (let i = 0; i < patternCount; i++) {
                patternCells.add(activeCellIds[i]);
            }
        }
        const imageCells = activeCellIds.filter((id) => !patternCells.has(id));

        // Only load images for image-designated active cells
        const urls = useFallbackOnly
            ? []
            : Array.from({ length: imageCells.length }, (_, i) => {
                  const img = heroImages[i % heroImages.length];
                  return selectAssetVariantSrc({
                      src: img.src,
                      sizes: img.sizes,
                      targetWidth: 800
                  });
              });

        let cancelled = false;

        Promise.all(
            urls.map(
                (url) =>
                    new Promise<HTMLImageElement>((resolve) => {
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        img.onload = () => resolve(img);
                        img.onerror = () => resolve(img);
                        img.src = url;
                    })
            )
        ).then((loaded) => {
            if (cancelled) return;

            loadedImagesRef.current = loaded.filter((img) => img.naturalWidth && img.naturalHeight);

            const now = performance.now();
            let imgIdx = 0;
            cellsRef.current = Array.from({ length: CELL_COUNT }, (_, i) => {
                if (!activeCells.has(i)) {
                    return {
                        image: null,
                        fallback: false,
                        hue: 0,
                        patternPoints: [],
                        targetOpacity: 0,
                        currentOpacity: 0,
                        nextToggleAt: Infinity,
                        sx: 0,
                        sy: 0,
                        sw: 0,
                        sh: 0
                    };
                }
                const usePatternTile = patternCells.has(i);
                const img =
                    usePatternTile || loaded.length === 0 ? null : loaded[imgIdx++ % loaded.length];
                const validImage = img && img.naturalWidth ? img : null;
                const crop = validImage
                    ? computeCoverCrop(validImage, CELL_W, CELL_H)
                    : { sx: 0, sy: 0, sw: 0, sh: 0 };
                const visible = Math.random() < 0.5;
                const fallback = usePatternTile || !validImage;
                return {
                    image: validImage,
                    fallback,
                    hue: 170 + Math.random() * 200,
                    patternPoints: fallback ? createPatternPoints() : [],
                    targetOpacity: visible ? 1 : 0,
                    currentOpacity: 0,
                    // Stagger initial toggles + random off-time (3-8s)
                    nextToggleAt: now + 2000 + Math.random() * 6000,
                    ...crop
                };
            });

            const canvas = document.createElement('canvas');
            canvas.width = MOSAIC_W;
            canvas.height = MOSAIC_H;
            canvasRef.current = canvas;
            ctxRef.current = canvas.getContext('2d')!;

            const staticLayer = document.createElement('canvas');
            staticLayer.width = MOSAIC_W;
            staticLayer.height = MOSAIC_H;
            const staticCtx = staticLayer.getContext('2d');
            if (staticCtx) {
                staticCtx.fillStyle = '#111';
                staticCtx.fillRect(0, 0, MOSAIC_W, MOSAIC_H);
                staticCtx.globalAlpha = 1;
                staticCtx.strokeStyle = '#333';
                for (let i = 1; i < GRID_COLS; i++) {
                    staticCtx.beginPath();
                    staticCtx.moveTo(i * CELL_W, 0);
                    staticCtx.lineTo(i * CELL_W, MOSAIC_H);
                    staticCtx.stroke();
                }
                for (let i = 1; i < GRID_ROWS; i++) {
                    staticCtx.beginPath();
                    staticCtx.moveTo(0, i * CELL_H);
                    staticCtx.lineTo(MOSAIC_W, i * CELL_H);
                    staticCtx.stroke();
                }
            }
            staticLayerRef.current = staticLayer;

            const tex = new THREE.CanvasTexture(canvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.repeat.x = -1;
            tex.offset.x = 1;
            tex.generateMipmaps = false;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
            textureRef.current = tex;
            if (ctxRef.current && staticLayerRef.current) {
                drawMosaic(
                    ctxRef.current,
                    cellsRef.current,
                    GRID_COLS,
                    GRID_ROWS,
                    staticLayerRef.current
                );
                tex.needsUpdate = true;
            }
            setReady(true);
        });

        return () => {
            cancelled = true;
        };
    }, [gl.capabilities, imageKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Animate cell opacities and redraw at a capped cadence.
    useFrame((_, delta) => {
        const ctx = ctxRef.current;
        const tex = textureRef.current;
        const cells = cellsRef.current;
        const staticLayer = staticLayerRef.current;
        if (!ctx || !tex || !staticLayer || cells.length === 0) return;

        elapsedRef.current += delta;
        if (elapsedRef.current < DRAW_INTERVAL) return;
        const step = elapsedRef.current;
        elapsedRef.current = 0;

        // Per-cell timers: each cell toggles on its own random schedule
        const now = performance.now();
        for (const cell of cells) {
            if ((!cell.image && !cell.fallback) || now < cell.nextToggleAt) continue;
            const goingOn = cell.targetOpacity < 0.5;
            if (goingOn) {
                assignRandomTileContent(
                    cell,
                    loadedImagesRef.current,
                    patternMixRatioRef.current,
                    CELL_W,
                    CELL_H
                );
            }
            cell.targetOpacity = goingOn ? 1 : 0;
            // Visible for 3-6s, dark for 5-12s
            cell.nextToggleAt =
                now + (goingOn ? 3000 + Math.random() * 3000 : 5000 + Math.random() * 7000);
        }

        // Lerp opacities
        let dirty = false;
        for (const cell of cells) {
            const diff = cell.targetOpacity - cell.currentOpacity;
            if (Math.abs(diff) > 0.005) {
                const fadeStep = Math.min(1, FADE_RATE * step);
                cell.currentOpacity += diff * fadeStep;
                dirty = true;
            } else if (cell.currentOpacity !== cell.targetOpacity) {
                cell.currentOpacity = cell.targetOpacity;
                dirty = true;
            }
        }

        if (dirty) {
            drawMosaic(ctx, cells, GRID_COLS, GRID_ROWS, staticLayer);
            tex.needsUpdate = true;
        }
    });

    const thetaStart = THREE.MathUtils.degToRad(GAP_ANGLE / 2);
    const thetaLength = THREE.MathUtils.degToRad(VIEW_ANGLE);
    const geometryArgs = [radius, radius, height, 32, 1, true, thetaStart, thetaLength] as const;

    return (
        <group>
            {ready && textureRef.current && (
                <mesh>
                    <cylinderGeometry args={geometryArgs} />
                    <meshBasicMaterial map={textureRef.current} side={THREE.BackSide} />
                </mesh>
            )}
            <mesh>
                <cylinderGeometry args={geometryArgs} />
                <meshBasicMaterial color="#181818" side={THREE.FrontSide} />
            </mesh>
        </group>
    );
}

const ORIGIN = new THREE.Vector3(0, 8, 25);
const TARGET = new THREE.Vector3(0, -1, 0);
const IDLE_TIMEOUT = 2500; // ms after last interaction before returning to origin
const SWEEP_SPEED = 0.01; // degrees per frame for the idle sweep target
const SWEEP_HALF = 25; // degrees each side of centre
const LERP_FACTOR = 0.008; // smoothing factor for all camera movement

function AnimatedControls() {
    const controlsRef = useRef<any>(null);
    const { camera } = useThree();
    const lastInteraction = useRef(0);
    const isReturning = useRef(false);
    const sweepAngle = useRef(0);
    const sweepDir = useRef(1);
    const isUserDragging = useRef(false);
    const sweepTarget = useRef(new THREE.Vector3().copy(ORIGIN));

    const panLimit = useMemo(() => THREE.MathUtils.degToRad(VIEW_ANGLE / 2), []);

    useFrame(() => {
        const controls = controlsRef.current;
        if (!controls) return;

        const elapsed = performance.now() - lastInteraction.current;

        // After idle timeout, start returning to origin then resume sweep
        if (
            isUserDragging.current === false &&
            lastInteraction.current > 0 &&
            elapsed > IDLE_TIMEOUT
        ) {
            isReturning.current = true;
        }

        if (isReturning.current) {
            camera.position.lerp(ORIGIN, LERP_FACTOR);
            controls.target.lerp(TARGET, LERP_FACTOR);

            if (camera.position.distanceTo(ORIGIN) < 0.1) {
                isReturning.current = false;
                lastInteraction.current = 0;
                sweepAngle.current = 0;
                sweepTarget.current.copy(ORIGIN);
            }
        }

        // Idle sweep: compute a target position and lerp towards it
        if (!isUserDragging.current && !isReturning.current) {
            sweepAngle.current += SWEEP_SPEED * sweepDir.current;
            if (Math.abs(sweepAngle.current) >= SWEEP_HALF) {
                sweepDir.current *= -1;
            }
            const rad = THREE.MathUtils.degToRad(sweepAngle.current);
            const dist = ORIGIN.length();
            sweepTarget.current.set(Math.sin(rad) * dist, ORIGIN.y, Math.cos(rad) * dist);
            camera.position.lerp(sweepTarget.current, LERP_FACTOR);
        }

        controls.update();
    });

    const handleStart = () => {
        isUserDragging.current = true;
        isReturning.current = false;
        lastInteraction.current = performance.now();
    };

    const handleEnd = () => {
        isUserDragging.current = false;
        lastInteraction.current = performance.now();
    };

    return (
        <OrbitControls
            ref={controlsRef}
            enableDamping
            dampingFactor={0.05}
            minAzimuthAngle={-panLimit}
            maxAzimuthAngle={panLimit}
            minPolarAngle={Math.PI / 3.2}
            maxPolarAngle={Math.PI / 1.8}
            minDistance={6}
            maxDistance={40}
            target={TARGET}
            onStart={handleStart}
            onEnd={handleEnd}
        />
    );
}

export default function LandingHero({
    heroImages,
    onActivate
}: {
    heroImages: { src: string; sizes?: number[] }[];
    onActivate?: () => void;
}) {
    const pointerRef = useRef<{
        id: number | null;
        startX: number;
        startY: number;
        startAt: number;
        moved: boolean;
    }>({
        id: null,
        startX: 0,
        startY: 0,
        startAt: 0,
        moved: false
    });

    const handlePointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        pointerRef.current = {
            id: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startAt: performance.now(),
            moved: false
        };
    };

    const handlePointerMoveCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
        const state = pointerRef.current;
        if (state.id !== event.pointerId || state.moved) return;
        const dx = event.clientX - state.startX;
        const dy = event.clientY - state.startY;
        if (dx * dx + dy * dy > 64) state.moved = true; // 8px threshold
    };

    const handlePointerUpCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
        const state = pointerRef.current;
        if (state.id !== event.pointerId) return;
        const elapsed = performance.now() - state.startAt;
        const shouldActivate = !state.moved && elapsed <= 350;
        pointerRef.current.id = null;
        if (shouldActivate) onActivate?.();
    };

    const handlePointerCancelCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (pointerRef.current.id === event.pointerId) pointerRef.current.id = null;
    };

    return (
        <div
            className="absolute inset-0"
            style={{ backgroundColor: '#111' }}
            onPointerDownCapture={handlePointerDownCapture}
            onPointerMoveCapture={handlePointerMoveCapture}
            onPointerUpCapture={handlePointerUpCapture}
            onPointerCancelCapture={handlePointerCancelCapture}
        >
            <Canvas
                camera={{ position: [0, 2, 20], fov: 50 }}
                dpr={[1, 1.5]}
                gl={{ antialias: true, powerPreference: 'high-performance' }}
            >
                <Suspense fallback={null}>
                    <MosaicCylinder heroImages={heroImages} radius={10} height={6} />
                </Suspense>
                <AnimatedControls />
            </Canvas>
        </div>
    );
}
