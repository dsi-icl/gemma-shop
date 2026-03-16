import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface AssetPreviewOverlayProps {
    src: string;
    name: string;
    isVideo: boolean;
    onClose: () => void;
}

function AssetPreviewOverlayInner({ src, name, isVideo, onClose }: AssetPreviewOverlayProps) {
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    return createPortal(
        <div
            className="fixed inset-0 z-10000 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                className="max-h-[90vh] max-w-[90vw]"
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
            >
                {isVideo ? (
                    <video
                        src={src}
                        controls
                        autoPlay
                        className="bg-checkerboard max-h-[90vh] max-w-[90vw] rounded-lg"
                    />
                ) : (
                    <img
                        src={src}
                        alt={name}
                        className="bg-checkerboard max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
                    />
                )}
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
    // This component is meant to be used with conditional rendering:
    // {preview && <AssetPreviewOverlay ... />}
    // The AnimatePresence wrapper is provided by AssetPreviewPortal below.
    return <AssetPreviewOverlayInner {...(props as AssetPreviewOverlayProps)} />;
}

/** Use this at the render site for proper enter/exit animations. */
export function AssetPreviewPortal({
    preview,
    onClose
}: {
    preview: { src: string; name: string; isVideo: boolean } | null;
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
                    onClose={onClose}
                />
            )}
        </AnimatePresence>
    );
}

export function downloadAsset(url: string, filename: string) {
    fetch(url)
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

export function isVideoAsset(asset: { mimeType?: string; name: string }): boolean {
    return asset.mimeType?.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv)$/i.test(asset.name);
}
