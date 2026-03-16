import { cn } from '@repo/ui/lib/utils';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Blurhash } from 'react-blurhash';

interface ProjectImageProps {
    /** Relative asset filename (e.g., "c45eb2a4.jpg") or prefixed path ("/api/assets/...") */
    src: string;
    blurhash?: string;
    /** Available variant widths (e.g., [50, 200, 800, 1600, 4000]) */
    sizes?: number[];
    alt?: string;
    className?: string;
    imgClassName?: string;
    /** Skip variant selection — load the original */
    forceOriginal?: boolean;
    onClick?: (e: React.MouseEvent) => void;
}

function selectSrc(
    src: string,
    sizes: number[] | undefined,
    physicalWidth: number,
    forceOriginal?: boolean
): string {
    // Ensure src is a full path
    const prefixed = src.startsWith('/api/assets/') ? src : `/api/assets/${src}`;

    if (forceOriginal || !sizes?.length) return prefixed;

    // Extract base ID: strip /api/assets/ prefix and file extension
    const filename = prefixed.split('/').pop()!;
    const baseId = filename.replace(/\.[^.]+$/, '');

    // Pick the smallest variant >= physicalWidth, else the largest available
    const sorted = [...sizes].sort((a, b) => a - b);
    const match = sorted.find((s) => s >= physicalWidth) ?? sorted[sorted.length - 1];
    return `/api/assets/${baseId}_${match}.webp`;
}

export function ProjectImage({
    src,
    blurhash,
    sizes,
    alt,
    className,
    imgClassName,
    forceOriginal,
    onClick
}: ProjectImageProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [loaded, setLoaded] = useState(false);
    const [measuredWidth, setMeasuredWidth] = useState(0);
    const maxWidthRef = useRef(0);

    // Reset loaded state when src changes
    const prevSrcRef = useRef(src);
    if (prevSrcRef.current !== src) {
        prevSrcRef.current = src;
        setLoaded(false);
        maxWidthRef.current = 0;
    }

    // Measure container with ResizeObserver
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                const physical = Math.ceil(width * (window.devicePixelRatio || 1));
                // Only upgrade, never downgrade
                if (physical > maxWidthRef.current) {
                    maxWidthRef.current = physical;
                    setMeasuredWidth(physical);
                }
            }
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const selectedSrc = selectSrc(src, sizes, measuredWidth, forceOriginal);

    const handleLoad = useCallback(() => setLoaded(true), []);

    return (
        <div
            ref={containerRef}
            className={cn('bg-checkerboard relative overflow-hidden', className)}
        >
            {/* TODO This is not working correctly, we need to look at sorting out the blurhash position and the image cover later */}
            <img
                src={selectedSrc}
                alt={alt}
                loading="lazy"
                className={cn(
                    'block h-full w-full object-contain transition-opacity duration-300',
                    loaded ? 'opacity-100' : 'opacity-0',
                    imgClassName
                )}
                onLoad={handleLoad}
                onClick={onClick}
            />
            {blurhash && (
                <Blurhash
                    hash={blurhash}
                    width={500}
                    height={500}
                    className={cn(
                        'absolute inset-0 h-full! w-full! transition-opacity duration-300',
                        loaded ? 'pointer-events-none opacity-0' : 'opacity-100'
                    )}
                />
            )}
        </div>
    );
}
