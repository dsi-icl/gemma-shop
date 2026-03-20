import Konva from 'konva';

import { hasActiveLayerFilters, normalizeLayerFilters } from '~/lib/layerFilters';
import type { LayerFilterState } from '~/lib/types';

export function applyKonvaFilters(node: Konva.Node | null, filters?: LayerFilterState) {
    if (!node) return;
    const n = node as any;

    if (!hasActiveLayerFilters(filters)) {
        n.filters?.([]);
        if (n.isCached?.()) n.clearCache();
        n.getLayer?.()?.batchDraw?.();
        return;
    }

    const f = normalizeLayerFilters(filters);
    const konvaFilters: Array<unknown> = [];

    if (f.grayscale) konvaFilters.push(Konva.Filters.Grayscale);
    if (f.invert) konvaFilters.push(Konva.Filters.Invert);
    if (f.brightness !== 100) konvaFilters.push(Konva.Filters.Brighten);
    if (f.contrast !== 100) konvaFilters.push(Konva.Filters.Contrast);
    if (f.hueRotate !== 0 || f.saturation !== 100) konvaFilters.push(Konva.Filters.HSL);
    if (f.blur > 0) konvaFilters.push(Konva.Filters.Blur);

    if (!konvaFilters.length) {
        n.filters?.([]);
        if (n.isCached?.()) n.clearCache();
        n.getLayer?.()?.batchDraw?.();
        return;
    }

    if (!n.isCached?.()) n.cache?.();
    n.filters?.(konvaFilters);

    // Konva ranges:
    // - Brighten: [-1, 1] where 0 is neutral
    // - Contrast: [-100, 100] where 0 is neutral
    // - HSL hue: degrees, saturation: [-1, 1]
    // - Blur radius: px-ish radius
    n.brightness?.((f.brightness - 100) / 100);
    n.contrast?.(f.contrast - 100);
    n.hue?.(f.hueRotate);
    n.saturation?.((f.saturation - 100) / 100);
    n.blurRadius?.(f.blur);
    n.getLayer?.()?.batchDraw?.();
}
