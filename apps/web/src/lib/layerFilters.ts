import type { LayerFilterState } from '~/lib/types';

export const DEFAULT_LAYER_FILTERS: LayerFilterState = {
    enabled: false,
    grayscale: false,
    invert: false,
    brightness: 100,
    contrast: 100,
    hueRotate: 0,
    saturation: 100,
    blur: 0
};

export const FILTER_PRESETS: Array<{ id: string; label: string; filters: LayerFilterState }> = [
    {
        id: 'none',
        label: 'None',
        filters: { ...DEFAULT_LAYER_FILTERS, enabled: false }
    },
    {
        id: 'bw',
        label: 'B&W',
        filters: {
            ...DEFAULT_LAYER_FILTERS,
            enabled: true,
            grayscale: true,
            contrast: 110
        }
    },
    {
        id: 'invert',
        label: 'Invert',
        filters: {
            ...DEFAULT_LAYER_FILTERS,
            enabled: true,
            invert: true
        }
    },
    {
        id: 'soft',
        label: 'Soft',
        filters: {
            ...DEFAULT_LAYER_FILTERS,
            enabled: true,
            contrast: 90,
            saturation: 90,
            blur: 1
        }
    }
];

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function normalizeLayerFilters(filters?: LayerFilterState): LayerFilterState {
    const merged = { ...DEFAULT_LAYER_FILTERS, ...(filters ?? {}) };
    return {
        ...merged,
        brightness: clamp(merged.brightness, 0, 200),
        contrast: clamp(merged.contrast, 0, 200),
        hueRotate: clamp(merged.hueRotate, -180, 180),
        saturation: clamp(merged.saturation, 0, 200),
        blur: clamp(merged.blur, 0, 20)
    };
}

export function hasActiveLayerFilters(filters?: LayerFilterState): boolean {
    const f = normalizeLayerFilters(filters);
    return (
        f.enabled &&
        (f.grayscale ||
            f.invert ||
            f.brightness !== 100 ||
            f.contrast !== 100 ||
            f.hueRotate !== 0 ||
            f.saturation !== 100 ||
            f.blur > 0)
    );
}

export function toCssFilterString(filters?: LayerFilterState): string {
    if (!hasActiveLayerFilters(filters)) return 'none';
    const f = normalizeLayerFilters(filters);
    return [
        f.grayscale ? 'grayscale(100%)' : '',
        f.invert ? 'invert(100%)' : '',
        `brightness(${f.brightness}%)`,
        `contrast(${f.contrast}%)`,
        `hue-rotate(${f.hueRotate}deg)`,
        `saturate(${f.saturation}%)`,
        `blur(${f.blur}px)`
    ]
        .filter(Boolean)
        .join(' ');
}
