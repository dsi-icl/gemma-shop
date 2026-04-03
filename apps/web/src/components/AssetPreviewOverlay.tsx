import { XIcon } from '@phosphor-icons/react';
import { normalizeAssetSrc, selectAssetVariantSrc } from '@repo/ui/lib/assetVariants';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { Blurhash } from 'react-blurhash';
import { createPortal } from 'react-dom';

import type { DeviceKind } from '~/lib/deviceIdentity';
import { signedFetch } from '~/lib/signedFetch';

interface AssetPreviewOverlayProps {
    src: string;
    name: string;
    isVideo: boolean;
    blurhash?: string;
    sizes?: number[];
    onClose: () => void;
}

function AssetPreviewOverlayInner({
    src,
    name,
    isVideo,
    blurhash,
    onClose
}: AssetPreviewOverlayProps) {
    if (typeof document === 'undefined') return null;

    const [viewport, setViewport] = useState(() => ({
        width: typeof window !== 'undefined' ? window.innerWidth : 1920,
        height: typeof window !== 'undefined' ? window.innerHeight : 1080
    }));
    const [mediaLoaded, setMediaLoaded] = useState(false);
    const [imageSrc, setImageSrc] = useState(src);

    useEffect(() => {
        setMediaLoaded(false);
    }, [src, isVideo]);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        const handleResize = () => {
            setViewport({ width: window.innerWidth, height: window.innerHeight });
        };

        window.addEventListener('keydown', handleKey);
        window.addEventListener('resize', handleResize);
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', handleKey);
            window.removeEventListener('resize', handleResize);
            document.body.style.overflow = '';
        };
    }, [onClose]);

    const selectedImageSrc = useMemo(() => {
        if (isVideo) return src;
        const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1;
        const targetPx = Math.ceil(Math.min(viewport.width * 0.92, viewport.height * 0.92) * dpr);
        return selectAssetVariantSrc({
            src,
            targetWidth: targetPx,
            stripVariantSuffix: true
        });
    }, [isVideo, src, viewport.height, viewport.width]);

    useEffect(() => {
        setImageSrc(selectedImageSrc);
    }, [selectedImageSrc]);

    const fallbackSrc = normalizeAssetSrc(src);
    const frameStyle = {
        width: Math.max(320, Math.floor(viewport.width * 0.92)),
        height: Math.max(180, Math.floor(viewport.height * 0.92))
    };

    return createPortal(
        <div
            className="fixed inset-0 z-10000 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
            onClick={onClose}
            onKeyDown={(e) => {
                if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') onClose();
            }}
            role="dialog"
            aria-modal="true"
            aria-label={`Preview ${name}`}
            tabIndex={-1}
        >
            <motion.div
                className="relative flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
            >
                <div className="relative overflow-hidden rounded-lg" style={frameStyle}>
                    <button
                        type="button"
                        onClick={onClose}
                        className="absolute top-5 right-5 z-30 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/70 text-white transition-colors hover:bg-black/90"
                        aria-label="Close preview"
                    >
                        <XIcon size={16} />
                    </button>
                    {blurhash ? (
                        <Blurhash
                            hash={blurhash}
                            width={500}
                            height={500}
                            className="pointer-events-none absolute inset-0 h-full! w-full! opacity-100"
                        />
                    ) : null}

                    {isVideo ? (
                        <video
                            src={fallbackSrc}
                            controls
                            autoPlay
                            className={`absolute inset-0 z-20 h-full w-full object-contain transition-opacity duration-300 ${
                                mediaLoaded ? 'opacity-100' : 'opacity-0'
                            }`}
                            onLoadedData={() => setMediaLoaded(true)}
                        >
                            <track kind="captions" />
                        </video>
                    ) : (
                        <img
                            src={imageSrc}
                            alt={name}
                            className={`bg-checkerboard absolute inset-0 z-20 m-auto block h-auto max-h-full w-auto max-w-full object-contain transition-opacity duration-300 ${
                                mediaLoaded ? 'opacity-100' : 'opacity-0'
                            }`}
                            onLoad={() => setMediaLoaded(true)}
                            onError={() => {
                                if (imageSrc !== fallbackSrc) {
                                    setImageSrc(fallbackSrc);
                                    setMediaLoaded(false);
                                }
                            }}
                        />
                    )}
                </div>
            </motion.div>
            <motion.div
                className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-xs text-white/70"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ delay: 0, duration: 0.3 }}
            >
                Click anywhere to close
            </motion.div>
        </div>,
        document.body
    );
}

/** Wrap with AnimatePresence — render when `preview` is non-null, pass `null` to unmount with exit animation. */
export function AssetPreviewOverlay(props: AssetPreviewOverlayProps | null) {
    if (!props) return null;
    return <AssetPreviewOverlayInner {...props} />;
}

/** Use this at the render site for proper enter/exit animations. */
export function AssetPreviewPortal({
    preview,
    onClose
}: {
    preview: {
        src: string;
        name: string;
        isVideo: boolean;
        blurhash?: string | null;
    } | null;
    onClose: () => void;
}) {
    return (
        <AnimatePresence>
            {preview && (
                <AssetPreviewOverlayInner
                    key="asset-preview"
                    src={preview.src}
                    name={preview.name}
                    isVideo={preview.isVideo}
                    blurhash={preview.blurhash ?? undefined}
                    onClose={onClose}
                />
            )}
        </AnimatePresence>
    );
}

export function downloadAsset(url: string, filename: string) {
    const inferDeviceSigning = (): { deviceKind: DeviceKind; wallId?: string } | undefined => {
        if (typeof window === 'undefined') return undefined;
        const path = window.location.pathname;
        const params = new URLSearchParams(window.location.search);
        if (path.startsWith('/wall')) {
            const wallId = params.get('w')?.trim() ?? undefined;
            return { deviceKind: 'wall', ...(wallId ? { wallId } : {}) };
        }
        if (path.startsWith('/gallery')) {
            const wallId = params.get('w')?.trim() ?? undefined;
            return { deviceKind: 'gallery', ...(wallId ? { wallId } : {}) };
        }
        if (path.startsWith('/controller')) {
            const wallId = params.get('w')?.trim() ?? undefined;
            return { deviceKind: 'controller', ...(wallId ? { wallId } : {}) };
        }
        return undefined;
    };

    signedFetch(url, undefined, inferDeviceSigning())
        .then((res) => res.blob())
        .then((blob) => {
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        });
}

export function isVideoAsset(asset: { mimeType?: string | null; name: string }): boolean {
    return asset.mimeType?.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv)$/i.test(asset.name);
}
