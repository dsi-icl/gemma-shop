import { selectAssetVariantSrc } from '@repo/ui/lib/assetVariants';
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
    const imgRef = useRef<HTMLImageElement>(null);
    const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
    const [measuredWidth, setMeasuredWidth] = useState(0);
    const maxWidthRef = useRef(0);

    // Reset measurement accumulator when source identity changes.
    useEffect(() => {
        maxWidthRef.current = 0;
    }, [src]);

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

    const selectedSrc = selectAssetVariantSrc({
        src,
        sizes,
        targetWidth: measuredWidth,
        forceOriginal
    });
    const loaded = loadedSrc === selectedSrc;

    const handleLoad = useCallback(() => setLoadedSrc(selectedSrc), [selectedSrc]);
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLImageElement>) => {
            if (!onClick) return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(e as unknown as React.MouseEvent);
            }
        },
        [onClick]
    );

    useEffect(() => {
        const el = imgRef.current;
        if (!el) return;
        const onSelected =
            el.currentSrc === selectedSrc ||
            el.src === selectedSrc ||
            el.currentSrc.endsWith(selectedSrc) ||
            el.src.endsWith(selectedSrc);
        if (!onSelected) return;
        if (el.complete && el.naturalWidth > 0) {
            requestAnimationFrame(() => {
                setLoadedSrc(selectedSrc);
            });
        }
    }, [selectedSrc]);

    return (
        <div
            ref={containerRef}
            className={cn('bg-checkerboard relative overflow-hidden', className)}
        >
            {blurhash && (
                <Blurhash
                    hash={blurhash}
                    width={500}
                    height={500}
                    className="pointer-events-none absolute inset-0 h-full! w-full! opacity-100"
                />
            )}
            <img
                ref={imgRef}
                src={selectedSrc}
                alt={alt}
                loading="lazy"
                className={cn(
                    'bg-checkerboard absolute inset-0 z-10 block h-full w-full object-cover transition-opacity duration-300',
                    loaded ? 'opacity-100' : 'opacity-0',
                    imgClassName
                )}
                onLoad={handleLoad}
                onClick={onClick}
                onKeyDown={handleKeyDown}
                role={onClick ? 'button' : undefined}
                tabIndex={onClick ? 0 : undefined}
            />
        </div>
    );
}
