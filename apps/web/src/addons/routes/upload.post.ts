import { unlink, writeFile } from 'fs/promises';
import { spawn } from 'node:child_process';
import { join, extname } from 'path';

import { defineHandler } from 'nitro/h3';

import { ASSET_DIR, TMP_DIR } from '~/lib/serverVariables';

const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff']);
const ALLOWED_VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv']);

function detectMediaType(bytes: Uint8Array): 'image' | 'video' | null {
    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image';
    // PNG: 89 50 4E 47
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
        return 'image';
    // GIF: 47 49 46
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image';
    // WebP: RIFF????WEBP
    if (
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
    )
        return 'image';
    // BMP: 42 4D
    if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image';
    // MP4/MOV: 'ftyp' box at offset 4
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70)
        return 'video';
    // WebM: 1A 45 DF A3
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3)
        return 'video';
    return null;
}

export default defineHandler(async (event) => {
    try {
        const formData = await event.req.formData();
        const uploadedFile = formData.get('asset') as File;
        const numericId = parseInt(formData.get('numericId') as string) || 0;
        const duration = parseFloat(formData.get('duration') as string) || 0;

        if (!uploadedFile) return new Response('No file', { status: 400 });

        const ext = extname(uploadedFile.name).toLowerCase();
        const baseName = uploadedFile.name.replace(ext, '').replace(/[^a-zA-Z0-9_-]/g, '_');

        // Validate by magic bytes — not by client-supplied MIME type
        const headerBytes = new Uint8Array(await uploadedFile.slice(0, 12).arrayBuffer());
        const detectedType = detectMediaType(headerBytes);

        // Fall back to extension only if magic bytes are inconclusive (e.g. AVI, MKV)
        const isImage =
            detectedType === 'image' ||
            (detectedType === null && ALLOWED_IMAGE_EXTS.has(ext) && !ALLOWED_VIDEO_EXTS.has(ext));
        const isVideo =
            detectedType === 'video' ||
            (detectedType === null && ALLOWED_VIDEO_EXTS.has(ext) && !ALLOWED_IMAGE_EXTS.has(ext));

        if (!isImage && !isVideo) return new Response('Unsupported file type', { status: 415 });

        // --- FAST PATH: STATIC IMAGES ---
        if (isImage) {
            const finalFilename = `${baseName}_img${ext}`;
            const finalPath = join(ASSET_DIR, finalFilename);
            await writeFile(finalPath, Buffer.from(await uploadedFile.arrayBuffer()));

            const fileUrl = `http://${new URL(event.req.url).host}/api/assets/${finalFilename}`;
            return new Response(JSON.stringify({ success: true, url: fileUrl }), {
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }

        // --- SLOW PATH: VIDEO TRANSCODING ---
        const rawFilename = `${baseName}_raw${ext}`;
        const finalFilename = `${baseName}_sync.mp4`;
        const rawPath = join(TMP_DIR, rawFilename);
        const finalPath = join(ASSET_DIR, finalFilename);

        await writeFile(rawPath, Buffer.from(await uploadedFile.arrayBuffer()));

        function run(cmd: string, args: string[]) {
            return new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
                const proc = spawn(cmd, args);
                let stdout = '';
                let stderr = '';

                proc.stdout.on('data', (d) => (stdout += d));
                proc.stderr.on('data', (d) => {
                    const text = d.toString();
                    stderr += text;

                    // Intercept FFmpeg's time output and broadcast it over WebSockets!
                    const match = text.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
                    if (match && duration > 0 && process.__BROADCAST_EDITORS__) {
                        const h = parseInt(match[1], 10);
                        const m = parseInt(match[2], 10);
                        const s = parseFloat(match[3]);
                        const timeInSeconds = h * 3600 + m * 60 + s;

                        const progress = Math.min(99, Math.round((timeInSeconds / duration) * 100));
                        process.__BROADCAST_EDITORS__({
                            type: 'processing_progress',
                            numericId,
                            progress
                        });
                    }
                });

                proc.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
            });
        }

        const ffmpeg = run('ffmpeg', [
            '-y', // Overwrite output files without asking
            '-i',
            rawPath, // Input file
            '-c:v',
            'libx264', // Hardware-friendly H.264 codec
            '-preset',
            'fast', // Balance between encoding speed and compression
            '-crf',
            '22', // High visual quality
            '-r',
            '60', // Force strict 60.00 fps CFR
            '-g',
            '60', // I-frame exactly every 60 frames (1 second)
            '-keyint_min',
            '60', // Minimum I-frame interval
            '-sc_threshold',
            '0', // Disable random scene-cut keyframes
            '-an', // Strip audio completely to kill the audio clock
            '-movflags',
            '+faststart', // Move MOOV atom to front for instant Blob caching
            finalPath // Output path
        ]);

        const exitObject = await ffmpeg;
        await unlink(rawPath).catch(() => {});

        if (exitObject.code !== 0) {
            console.error('FFmpeg Error:', exitObject.stderr);
            return new Response('Video processing failed', { status: 500 });
        }

        const fileUrl = `http://${new URL(event.req.url).host}/api/assets/${finalFilename}`;
        return new Response(JSON.stringify({ success: true, url: fileUrl }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    } catch (err) {
        console.error('Upload handler crashed:', err);
        return new Response('Upload Error', { status: 500 });
    }
});
