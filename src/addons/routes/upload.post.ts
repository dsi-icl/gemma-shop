import { unlink, writeFile } from 'fs/promises';
import { spawn } from 'node:child_process';
import { join, extname } from 'path';

import { defineHandler } from 'nitro/h3';

import { ASSET_DIR, TMP_DIR } from '@/lib/serverVariables';

export default defineHandler(async (event) => {
    try {
        const formData = await event.req.formData();
        const uploadedFile = formData.get('asset') as File;
        const numericId = parseInt(formData.get('numericId') as string) || 0;
        const duration = parseFloat(formData.get('duration') as string) || 0;

        if (!uploadedFile) return new Response('No file', { status: 400 });

        const ext = extname(uploadedFile.name).toLowerCase();
        const baseName = uploadedFile.name.replace(ext, '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const isImage = uploadedFile.type.startsWith('image/');

        // --- FAST PATH: STATIC IMAGES ---
        if (isImage) {
            const finalFilename = `${baseName}_img${ext}`;
            const finalPath = join(ASSET_DIR, finalFilename);
            await writeFile(finalPath, Buffer.from(await uploadedFile.arrayBuffer()));

            const fileUrl = `http://${new URL(event.req.url).host}/assets/${finalFilename}`;
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
                    if (match && duration > 0 && (globalThis as any).__BROADCAST_EDITORS__) {
                        const h = parseInt(match[1], 10);
                        const m = parseInt(match[2], 10);
                        const s = parseFloat(match[3]);
                        const timeInSeconds = h * 3600 + m * 60 + s;

                        const progress = Math.min(99, Math.round((timeInSeconds / duration) * 100));
                        (globalThis as any).__BROADCAST_EDITORS__({
                            type: 'upload_progress',
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

        const fileUrl = `http://${new URL(event.req.url).host}/assets/${finalFilename}`;
        return new Response(JSON.stringify({ success: true, url: fileUrl }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    } catch (err) {
        console.error('Upload handler crashed:', err);
        return new Response('Upload Error', { status: 500 });
    }
});
