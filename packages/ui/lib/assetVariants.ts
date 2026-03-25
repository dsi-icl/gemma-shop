export function normalizeAssetSrc(src: string): string {
    return src.startsWith('/api/assets/') ? src : `/api/assets/${src}`;
}

export function hasAssetVariants(sizes: number[] | undefined): sizes is number[] {
    return Array.isArray(sizes) && sizes.length > 0;
}

export function selectAssetVariantSrc({
    src,
    sizes,
    targetWidth,
    forceOriginal = false,
    stripVariantSuffix = false
}: {
    src: string;
    sizes: number[] | undefined;
    targetWidth: number;
    forceOriginal?: boolean;
    stripVariantSuffix?: boolean;
}): string {
    const prefixed = normalizeAssetSrc(src);
    if (forceOriginal || !hasAssetVariants(sizes)) return prefixed;

    const filename = prefixed.split('/').pop() ?? '';
    if (!filename) return prefixed;

    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'svg') return prefixed;

    let baseId = filename.replace(/\.[^.]+$/, '');
    if (stripVariantSuffix) {
        baseId = baseId.replace(/_\d+$/, '');
    }

    const sorted = [...sizes].sort((a, b) => a - b);
    const desiredWidth = Math.max(1, Math.ceil(targetWidth));
    const match = sorted.find((s) => s >= desiredWidth) ?? sorted[sorted.length - 1];
    return `/api/assets/${baseId}_${match}.webp`;
}
