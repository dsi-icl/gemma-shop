export function normalizeAssetSrc(src: string): string {
    return src.startsWith('/api/assets/') ? src : `/api/assets/${src}`;
}

export function isSvgAssetSrc(src: string): boolean {
    const normalized = normalizeAssetSrc(src);
    const withoutQuery = normalized.split('?')[0]?.split('#')[0] ?? normalized;
    return withoutQuery.toLowerCase().endsWith('.svg');
}

export function hasAssetVariants(sizes: number[] | undefined): sizes is number[] {
    return Array.isArray(sizes) && sizes.length > 0;
}

const DEFAULT_VARIANT_WIDTHS = [50, 200, 800, 1600, 2400, 3200];

export function selectAssetVariantSrc({
    src,
    sizes,
    targetWidth,
    forceOriginal = false,
    stripVariantSuffix = false
}: {
    src: string;
    sizes?: number[] | undefined;
    targetWidth: number;
    forceOriginal?: boolean;
    stripVariantSuffix?: boolean;
}): string {
    const prefixed = normalizeAssetSrc(src);
    if (forceOriginal) return prefixed;

    const filename = prefixed.split('/').pop() ?? '';
    if (!filename) return prefixed;

    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'svg') return prefixed;

    let baseId = filename.replace(/\.[^.]+$/, '');
    if (stripVariantSuffix) {
        baseId = baseId.replace(/_\d+$/, '');
    }

    const sorted = hasAssetVariants(sizes)
        ? [...sizes].sort((a, b) => a - b)
        : DEFAULT_VARIANT_WIDTHS;
    const desiredWidth = Math.max(1, Math.ceil(targetWidth));
    const match = sorted.find((s) => s >= desiredWidth) ?? sorted[sorted.length - 1];
    return `/api/assets/${baseId}_${match}.webp`;
}
