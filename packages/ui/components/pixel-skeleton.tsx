import { useEffect, useRef } from 'react';

interface PixelSkeletonProps {
    children?: React.ReactNode;
    width: string | number;
    height: string | number;
    gridSize?: number;
    burstDuration?: number;
    litColor?: string;
    isLoaded?: boolean;
    className?: string;
}

export const PixelSkeleton: React.FC<PixelSkeletonProps> = ({
    children,
    width,
    height,
    gridSize = 60,
    burstDuration = 1000,
    litColor = '#333333',
    isLoaded = false,
    className = ''
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;

        if (!canvas || !container || isLoaded) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = container.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        canvas.width = rect.width;
        canvas.height = rect.height;

        const cols = Math.max(1, Math.round(canvas.width / gridSize));
        const rows = Math.max(1, Math.round(canvas.height / gridSize));

        const cellW = canvas.width / cols;
        const cellH = canvas.height / rows;

        const centerPixelX = canvas.width / 2;
        const centerPixelY = canvas.height / 2;

        const maxDist = Math.sqrt(Math.pow(centerPixelX, 2) + Math.pow(centerPixelY, 2));

        const minDistToEdge = Math.min(centerPixelX, centerPixelY);

        const avgCellSize = (cellW + cellH) / 2;
        const headLength = avgCellSize * 2;
        const tailLength = maxDist * 0.7;
        const totalTravel = maxDist + tailLength;

        const getRand = (x: number, y: number) => {
            const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
            return seed - Math.floor(seed);
        };

        let startTime: number | null = null;
        let animationFrameId: number;

        const drawFrame = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;

            const burstProgress = elapsed / burstDuration;
            const waveCrest = burstProgress * totalTravel;
            const timeInSeconds = elapsed / 1000;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // --- 1. Draw the Persistent Border ---
            const distFromEdge = waveCrest - minDistToEdge;
            let burstBorderAlpha = 0;

            // The bright collision flash
            if (distFromEdge >= 0 && distFromEdge <= tailLength) {
                burstBorderAlpha = Math.pow(1 - distFromEdge / tailLength, 2);
            } else if (distFromEdge < 0 && Math.abs(distFromEdge) <= headLength) {
                burstBorderAlpha = 1 - Math.abs(distFromEdge) / headLength;
            }

            // Border Ignition Logic: Ramp from 0 to 1 as the wave head crosses the edge
            const pulseActivation = Math.min(
                1,
                Math.max(0, (distFromEdge + headLength) / headLength)
            );

            // Apply the activation multiplier to the continuous pulse
            const pulseBorderAlpha =
                pulseActivation * (0.2 + ((Math.sin(timeInSeconds * 1.5) + 1) / 2) * 0.2);

            // Combine them
            const finalBorderAlpha = Math.max(burstBorderAlpha, pulseBorderAlpha);

            if (finalBorderAlpha > 0) {
                ctx.globalAlpha = finalBorderAlpha;
                ctx.strokeStyle = litColor;
                ctx.lineWidth = 3;
                ctx.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
            }

            // --- 2. Draw the Cells ---
            for (let x = 0; x < cols; x++) {
                for (let y = 0; y < rows; y++) {
                    const pixelX = (x + 0.5) * cellW;
                    const pixelY = (y + 0.5) * cellH;

                    const dist = Math.sqrt(
                        Math.pow(pixelX - centerPixelX, 2) + Math.pow(pixelY - centerPixelY, 2)
                    );

                    const distanceFromCrest = waveCrest - dist;
                    let burstAlpha = 0;

                    if (distanceFromCrest >= 0 && distanceFromCrest <= tailLength) {
                        burstAlpha = Math.pow(1 - distanceFromCrest / tailLength, 2);
                    } else if (distanceFromCrest < 0 && Math.abs(distanceFromCrest) <= headLength) {
                        burstAlpha = 1 - Math.abs(distanceFromCrest) / headLength;
                    }

                    let fireflyAlpha = 0;

                    if (waveCrest > dist) {
                        const rand = getRand(x, y);
                        const speed = rand * 2.0 + 0.5;
                        const phase = rand * Math.PI * 2;

                        const sineVal = (Math.sin(timeInSeconds * speed + phase) + 1) / 2;
                        fireflyAlpha = Math.pow(sineVal, 20) * 0.15;
                    }

                    const finalAlpha = Math.max(burstAlpha, fireflyAlpha);

                    if (finalAlpha > 0) {
                        ctx.globalAlpha = finalAlpha;
                        ctx.fillStyle = litColor;
                        ctx.beginPath();
                        ctx.rect(x * cellW, y * cellH, cellW - 2, cellH - 2);
                        ctx.fill();
                    }
                }
            }

            animationFrameId = window.requestAnimationFrame(drawFrame);
        };

        animationFrameId = window.requestAnimationFrame(drawFrame);

        return () => {
            window.cancelAnimationFrame(animationFrameId);
        };
    }, [gridSize, burstDuration, litColor, isLoaded]);

    return (
        <div
            ref={containerRef}
            className={`skeleton-wrapper ${className}`}
            style={{
                position: 'relative',
                display: 'inline-block',
                overflow: 'hidden',
                width,
                height
            }}
        >
            <div
                style={{
                    opacity: isLoaded ? 1 : 0,
                    transition: 'opacity 0.5s ease',
                    height: '100%'
                }}
            >
                {children}
            </div>

            <canvas
                ref={canvasRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 10,
                    opacity: isLoaded ? 0 : 1,
                    transition: 'opacity 0.5s ease'
                }}
            />
        </div>
    );
};
