export function fitSizeToViewport(
    width: number,
    height: number,
    viewportWidth: number,
    viewportHeight: number,
    marginRatio = 0.9
): { width: number; height: number } {
    const safeW = Math.max(1, width);
    const safeH = Math.max(1, height);
    const maxW = Math.max(1, viewportWidth * marginRatio);
    const maxH = Math.max(1, viewportHeight * marginRatio);
    const scale = Math.min(1, maxW / safeW, maxH / safeH);
    return {
        width: Math.round(safeW * scale),
        height: Math.round(safeH * scale)
    };
}
