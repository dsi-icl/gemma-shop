import { spawn } from 'node:child_process';
import { copyFile, open, stat, unlink } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { db } from '@repo/db';
import { createFileRoute } from '@tanstack/react-router';
import { FileStore } from '@tus/file-store';
import { Server } from '@tus/server';
import { ObjectId } from 'mongodb';

import { computeBlurhash, generateVariants } from '~/lib/serverAssetUtils';
import { UPLOAD_DIR, TMP_DIR, ASSET_DIR, PUBLIC_ASSET_PROJECT_ID } from '~/lib/serverVariables';
import { validateUploadToken } from '~/lib/uploadTokens';

const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff']);
const ALLOWED_VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv']);

function detectMediaType(bytes: Uint8Array): 'image' | 'video' | null {
    const len = bytes.length;

    // JPEG: FF D8 FF
    if (len >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image';
    // PNG: 89 50 4E 47
    if (
        len >= 4 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47
    )
        return 'image';
    // GIF: 47 49 46
    if (len >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image';
    // WebP: RIFF????WEBP
    if (
        len >= 12 &&
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
    if (len >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image';
    // MP4/MOV: 'ftyp' box at offset 4
    if (
        len >= 8 &&
        bytes[4] === 0x66 &&
        bytes[5] === 0x74 &&
        bytes[6] === 0x79 &&
        bytes[7] === 0x70
    )
        return 'video';
    // WebM: 1A 45 DF A3
    if (
        len >= 4 &&
        bytes[0] === 0x1a &&
        bytes[1] === 0x45 &&
        bytes[2] === 0xdf &&
        bytes[3] === 0xa3
    )
        return 'video';
    return null;
}

async function readHeaderBytes(filePath: string, size = 12): Promise<Uint8Array> {
    const file = await open(filePath, 'r');
    try {
        const buffer = Buffer.allocUnsafe(size);
        const { bytesRead } = await file.read(buffer, 0, size, 0);
        return new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead);
    } finally {
        await file.close();
    }
}

function runFFmpeg(
    args: string[],
    numericId: number,
    duration: number
): Promise<{ code: number; stderr: string }> {
    return new Promise((resolve) => {
        const proc = spawn('ffmpeg', args);
        let stderr = '';
        proc.stderr.on('data', (d) => {
            const text = d.toString();
            stderr += text;

            const match = text.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
            if (match && process.__BROADCAST_EDITORS__) {
                const h = parseInt(match[1], 10);
                const m = parseInt(match[2], 10);
                const s = parseFloat(match[3]);
                const timeInSeconds = h * 3600 + m * 60 + s;

                const progress =
                    duration > 0
                        ? Math.min(99, Math.round((timeInSeconds / duration) * 100))
                        : Math.min(99, Math.round(timeInSeconds));

                process.__BROADCAST_EDITORS__({
                    type: 'processing_progress',
                    numericId,
                    progress
                });
            }
        });
        proc.on('close', (code) => resolve({ code: code ?? 0, stderr }));
    });
}

/** Extract a preview frame from a video using FFmpeg */
async function extractVideoPreview(
    videoPath: string,
    outputPath: string,
    duration: number
): Promise<boolean> {
    const seekTo = Math.min(0.5, duration / 2);
    return new Promise((resolve) => {
        const proc = spawn('ffmpeg', [
            '-y', // Overwrite output files without asking
            '-ss',
            seekTo.toString(), // Seek to timestamp
            '-i',
            videoPath,
            '-frames:v',
            '1', // Output one video frame
            '-q:v',
            '2', // Quality level for image encoding
            outputPath
        ]);
        proc.on('close', (code) => resolve(code === 0));
    });
}

const tusServer = new Server({
    path: '/api/uploads',
    datastore: new FileStore({ directory: UPLOAD_DIR }),
    async onUploadFinish(req, upload) {
        const tusFilePath = join(UPLOAD_DIR, upload.id);

        try {
            const originalName = upload.metadata?.filename ?? upload.id;
            const ext = extname(originalName).toLowerCase();
            const numericId = parseInt(upload.metadata?.numericId ?? '0') || 0;
            const duration = parseFloat(upload.metadata?.duration ?? '0') || 0;

            // Resolve projectId and userEmail from either upload token or session metadata
            let projectId: string | null = null;
            let userEmail = 'system';
            const uploadToken = upload.metadata?.uploadToken;
            if (uploadToken) {
                const tokenData = validateUploadToken(uploadToken);
                if (!tokenData) {
                    console.warn('[Tus] Upload rejected: invalid or expired token');
                    await unlink(tusFilePath).catch(() => {});
                    return {};
                }
                projectId = tokenData.projectId;
                userEmail = tokenData.userEmail;
            } else {
                projectId = upload.metadata?.projectId ?? null;
                userEmail = upload.metadata?.userEmail ?? 'system';
            }

            // Detect type via magic bytes
            const headerBytes = await readHeaderBytes(tusFilePath, 12);
            const detectedType = detectMediaType(headerBytes);

            const isImage =
                detectedType === 'image' ||
                (detectedType === null &&
                    ALLOWED_IMAGE_EXTS.has(ext) &&
                    !ALLOWED_VIDEO_EXTS.has(ext));
            const isVideo =
                detectedType === 'video' ||
                (detectedType === null &&
                    ALLOWED_VIDEO_EXTS.has(ext) &&
                    !ALLOWED_IMAGE_EXTS.has(ext));

            let assetFilename: string | null = null;
            let previewFilename: string | null = null;
            let blurhash: string | null = null;
            let mimeType: string | null = null;
            let sizes: number[] = [];

            if (isImage) {
                // ── Image: copy with upload.id-based name ──
                assetFilename = `${upload.id}${ext}`;
                const finalPath = join(ASSET_DIR, assetFilename);
                await copyFile(tusFilePath, finalPath);

                mimeType = `image/${ext.slice(1)}`;
                blurhash = await computeBlurhash(finalPath);
                sizes = await generateVariants(finalPath, upload.id);
            } else if (isVideo) {
                // ── Video: transcode + generate preview ──
                assetFilename = `${upload.id}.mp4`;
                previewFilename = `${upload.id}_preview.jpg`;
                const rawPath = join(TMP_DIR, `${upload.id}_raw${ext}`);
                const finalPath = join(ASSET_DIR, assetFilename);
                const previewPath = join(ASSET_DIR, previewFilename);

                await copyFile(tusFilePath, rawPath);

                const result = await runFFmpeg(
                    [
                        '-y', // Overwrite output files without asking
                        '-i',
                        rawPath,
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
                        finalPath
                    ],
                    numericId,
                    duration
                );

                await unlink(rawPath).catch(() => {});

                if (result.code !== 0) {
                    console.error('[Tus] FFmpeg transcode failed:', result.stderr);
                } else {
                    // Extract preview frame, compute blurhash, and generate variants from it
                    const previewOk = await extractVideoPreview(finalPath, previewPath, duration);
                    if (previewOk) {
                        blurhash = await computeBlurhash(previewPath);
                        sizes = await generateVariants(previewPath, upload.id);
                    }
                }

                mimeType = 'video/mp4';
            }

            // Clean up the raw tus upload (keep .json metadata for reference)
            await unlink(tusFilePath).catch(() => {});

            // ── Create asset record in DB ──
            if (assetFilename && projectId) {
                const fileSize =
                    (await stat(join(ASSET_DIR, assetFilename)).catch(() => null))?.size ??
                    upload.size;

                const isPublicAsset = projectId === PUBLIC_ASSET_PROJECT_ID;
                const insertResult = await db.collection('assets').insertOne({
                    projectId: new ObjectId(projectId),
                    name: originalName,
                    url: assetFilename,
                    size: fileSize,
                    mimeType,
                    blurhash,
                    previewUrl: previewFilename ?? undefined,
                    sizes: sizes.length > 0 ? sizes : undefined,
                    public: isPublicAsset,
                    createdBy: userEmail,
                    createdAt: new Date().toISOString()
                });

                // Broadcast to all editors on this project via bus bridge
                console.log(
                    `[Tus] Broadcasting asset_added: bridge=${!!process.__BROADCAST_ASSET_ADDED__}, projectId=${projectId}`
                );
                if (process.__BROADCAST_ASSET_ADDED__) {
                    process.__BROADCAST_ASSET_ADDED__(projectId, {
                        _id: insertResult.insertedId.toString(),
                        name: originalName,
                        url: assetFilename,
                        size: fileSize,
                        mimeType: mimeType ?? undefined,
                        blurhash: blurhash ?? undefined,
                        previewUrl: previewFilename ?? undefined,
                        sizes: sizes.length > 0 ? sizes : undefined,
                        createdAt: new Date().toISOString(),
                        createdBy: userEmail
                    });
                }

                console.log(
                    `[Tus] Asset created: ${assetFilename} (blurhash: ${blurhash ? 'yes' : 'no'}, sizes: [${sizes.join(', ')}])`
                );
            }
        } catch (err) {
            console.error('[Tus] onUploadFinish error:', err);
        }

        return {};
    }
});

function handleTus({ request }: { request: Request }) {
    return tusServer.handleWeb(request);
}

export const Route = createFileRoute('/api/uploads/$')({
    server: {
        handlers: {
            ANY: handleTus
        }
    }
});
