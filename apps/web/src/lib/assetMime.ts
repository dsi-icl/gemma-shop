export const SUPPORTED_IMAGE_EXTS = new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.bmp',
    '.tiff',
    '.svg'
]);

export const SUPPORTED_VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv']);

export const SUPPORTED_FONT_EXTS = new Set(['.woff2']);

export const ASSET_MIME_TYPES: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2'
};
