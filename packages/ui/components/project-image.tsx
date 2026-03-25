import { useCallback, useEffect, useRef, useState } from 'react';
import { Blurhash } from 'react-blurhash';

import { cn } from '../lib/utils';

interface ProjectImageProps {
    src: string;
    blurhash?: string;
    sizes?: number[];
    alt?: string;
    className?: string;
    imgClassName?: string;
    forceOriginal?: boolean;
    onClick?: (e: React.MouseEvent) => void;
}

function selectSrc(
    src: string,
    sizes: number[] | undefined,
    physicalWidth: number,
    forceOriginal?: boolean
): string {
    const prefixed = src.startsWith('/api/assets/') ? src : `/api/assets/${src}`;

    if (forceOriginal || !sizes?.length) return prefixed;

    const filename = prefixed.split('/').pop()!;
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'svg') return prefixed;
    const baseId = filename.replace(/\.[^.]+$/, '');

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
    const imgRef = useRef<HTMLImageElement>(null);
    const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
    const [measuredWidth, setMeasuredWidth] = useState(0);
    const maxWidthRef = useRef(0);

    useEffect(() => {
        maxWidthRef.current = 0;
    }, [src]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                const physical = Math.ceil(width * (window.devicePixelRatio || 1));
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
            {blurhash ? (
                <Blurhash
                    hash={blurhash}
                    width={500}
                    height={500}
                    className="pointer-events-none absolute inset-0 h-full! w-full! opacity-100"
                />
            ) : null}
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
