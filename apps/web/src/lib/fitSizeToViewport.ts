export const MIN_LAYER_DIMENSION = 20;

export function fitSizeToViewport(
    width: number,
    height: number,
    viewportWidth: number,
    viewportHeight: number,
    marginRatio = 0.9
): { width: number; height: number } {
    const safeW = Math.max(MIN_LAYER_DIMENSION, width);
    const safeH = Math.max(MIN_LAYER_DIMENSION, height);
    const maxW = Math.max(1, viewportWidth * marginRatio);
    const maxH = Math.max(1, viewportHeight * marginRatio);
    const scale = Math.min(1, maxW / safeW, maxH / safeH);
    return {
        width: Math.max(MIN_LAYER_DIMENSION, Math.round(safeW * scale)),
        height: Math.max(MIN_LAYER_DIMENSION, Math.round(safeH * scale))
    };
}
