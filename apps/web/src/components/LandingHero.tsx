import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { selectAssetVariantSrc } from '@repo/ui/lib/assetVariants';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

// Arc length = radius(10) × degToRad(313) ≈ 54.6, height = 6
// Surface aspect ≈ 9.1:1, so 4096 / 9.1 ≈ 450
const MOSAIC_W = 4096;
const MOSAIC_H = Math.round(MOSAIC_W * (6 / (10 * THREE.MathUtils.degToRad(313))));

const GRID_COLS = 16;
const GRID_ROWS = 4;
const CELL_COUNT = GRID_COLS * GRID_ROWS;
const FADE_SPEED = 0.006; // opacity change per frame
const FILL_RATIO = 0.4; // fraction of cells that get an image at all

interface CellState {
    image: HTMLImageElement | null;
    targetOpacity: number; // 0 or 1
    currentOpacity: number; // lerped
    nextToggleAt: number; // timestamp when this cell next changes state
}

function drawMosaic(ctx: CanvasRenderingContext2D, cells: CellState[], cols: number, rows: number) {
    const cellW = MOSAIC_W / cols;
    const cellH = MOSAIC_H / rows;

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, MOSAIC_W, MOSAIC_H);

    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (cell.currentOpacity < 0.01 || !cell.image) continue;

        const img = cell.image;
        if (!img.naturalWidth || !img.naturalHeight) continue;

        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * cellW;
        const y = row * cellH;

        // Cover-fit: fill cell without distortion, crop the overflow
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const cellAspect = cellW / cellH;
        let sw: number, sh: number, sx: number, sy: number;
        if (imgAspect > cellAspect) {
            sh = img.naturalHeight;
            sw = sh * cellAspect;
            sx = (img.naturalWidth - sw) / 2;
            sy = 0;
        } else {
            sw = img.naturalWidth;
            sh = sw / cellAspect;
            sx = 0;
            sy = (img.naturalHeight - sh) / 2;
        }

        ctx.globalAlpha = cell.currentOpacity;
        ctx.drawImage(img, sx, sy, sw, sh, x, y, cellW, cellH);
    }

    // Grid lines (always full opacity)
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#333';
    for (let i = 1; i < cols; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellW, 0);
        ctx.lineTo(i * cellW, MOSAIC_H);
        ctx.stroke();
    }
    for (let i = 1; i < rows; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * cellH);
        ctx.lineTo(MOSAIC_W, i * cellH);
        ctx.stroke();
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
    const textureRef = useRef<THREE.CanvasTexture | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const cellsRef = useRef<CellState[]>([]);
    const [ready, setReady] = useState(false);

    const imageKey = useMemo(() => heroImages.map((h) => h.src).join(','), [heroImages]);

    // Load images and initialise cell state
    useEffect(() => {
        if (heroImages.length === 0) return;

        // Only assign images to a subset of cells
        const fillCount = Math.round(CELL_COUNT * FILL_RATIO);
        const shuffled = Array.from({ length: CELL_COUNT }, (_, i) => i);
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const activeCells = new Set(shuffled.slice(0, fillCount));

        // Only load images for active cells
        const urls = Array.from({ length: fillCount }, (_, i) => {
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

            const now = performance.now();
            let imgIdx = 0;
            cellsRef.current = Array.from({ length: CELL_COUNT }, (_, i) => {
                if (!activeCells.has(i)) {
                    return {
                        image: null,
                        targetOpacity: 0,
                        currentOpacity: 0,
                        nextToggleAt: Infinity
                    };
                }
                const img = loaded[imgIdx++ % loaded.length];
                const visible = Math.random() < 0.5;
                return {
                    image: img.naturalWidth ? img : null,
                    targetOpacity: visible ? 1 : 0,
                    currentOpacity: 0,
                    // Stagger initial toggles + random off-time (3-8s)
                    nextToggleAt: now + 2000 + Math.random() * 6000
                };
            });

            const canvas = document.createElement('canvas');
            canvas.width = MOSAIC_W;
            canvas.height = MOSAIC_H;
            canvasRef.current = canvas;
            ctxRef.current = canvas.getContext('2d')!;

            const tex = new THREE.CanvasTexture(canvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.repeat.x = -1;
            tex.offset.x = 1;
            textureRef.current = tex;
            setReady(true);
        });

        return () => {
            cancelled = true;
        };
    }, [imageKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Animate cell opacities and redraw canvas each frame
    useFrame(() => {
        const ctx = ctxRef.current;
        const tex = textureRef.current;
        const cells = cellsRef.current;
        if (!ctx || !tex || cells.length === 0) return;

        // Per-cell timers: each cell toggles on its own random schedule
        const now = performance.now();
        for (const cell of cells) {
            if (!cell.image || now < cell.nextToggleAt) continue;
            const goingOn = cell.targetOpacity < 0.5;
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
                cell.currentOpacity += diff * FADE_SPEED;
                dirty = true;
            } else if (cell.currentOpacity !== cell.targetOpacity) {
                cell.currentOpacity = cell.targetOpacity;
                dirty = true;
            }
        }

        if (dirty) {
            drawMosaic(ctx, cells, GRID_COLS, GRID_ROWS);
            tex.needsUpdate = true;
        }
    });

    const thetaStart = THREE.MathUtils.degToRad(GAP_ANGLE / 2);
    const thetaLength = THREE.MathUtils.degToRad(VIEW_ANGLE);
    const geometryArgs = [radius, radius, height, 64, 1, true, thetaStart, thetaLength] as const;

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
const SWEEP_SPEED = 0.1; // degrees per frame for the idle sweep target
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
    heroImages
}: {
    heroImages: { src: string; sizes?: number[] }[];
}) {
    return (
        <div className="absolute inset-0" style={{ backgroundColor: '#111' }}>
            <Canvas camera={{ position: [0, 2, 20], fov: 50 }}>
                <Suspense fallback={null}>
                    <MosaicCylinder heroImages={heroImages} radius={10} height={6} />
                </Suspense>
                <AnimatedControls />
            </Canvas>
        </div>
    );
}
