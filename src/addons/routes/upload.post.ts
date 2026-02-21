import { unlink, writeFile } from 'fs/promises';
import { spawn } from 'node:child_process';
import { join, extname } from 'path';

import { defineHandler } from 'nitro/h3';

import { ASSET_DIR, TMP_DIR } from '@/lib/serverVariables';

export default defineHandler(async (event) => {
    try {
        const formData = await event.req.formData();
        const uploadedFile = formData.get('asset') as File;
        if (!uploadedFile) return new Response('No file', { status: 400 });

        // 1. Sanitize the filename
        const ext = extname(uploadedFile.name);
        const baseName = uploadedFile.name.replace(ext, '').replace(/[^a-zA-Z0-9_-]/g, '_');

        const rawFilename = `${baseName}_raw${ext}`;
        const finalFilename = `${baseName}_sync.mp4`; // Always output mp4

        const rawPath = join(TMP_DIR, rawFilename);
        const finalPath = join(ASSET_DIR, finalFilename);

        // 2. Save the raw upload to the temporary directory
        await writeFile(rawPath, Buffer.from(await uploadedFile.arrayBuffer()));
        console.log(`Ingested raw file: ${rawFilename}. Starting FFmpeg optimization...`);

        // 3. Spawn FFmpeg with our Sync-Optimized Profile

        function run(cmd: string, args: string[]) {
            return new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
                const proc = spawn(cmd, args);

                let stdout = '';
                let stderr = '';

                proc.stdout.on('data', (d) => (stdout += d));
                proc.stderr.on('data', (d) => (stderr += d));

                proc.on('close', (code) => {
                    resolve({ stdout, stderr, code: code ?? 0 });
                });
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

        // 4. Wait for the transcoding to finish
        const exitObject = await ffmpeg;

        if (exitObject.code !== 0) {
            const errorOutput = await new Response(exitObject.stderr).text();
            console.error('FFmpeg Error:', errorOutput);
            // Clean up the raw file even on failure
            await unlink(rawPath).catch(() => {});
            return new Response('Video processing failed', { status: 500 });
        }

        console.log(`FFmpeg complete: ${finalFilename} is ready for the wall.`);

        // 5. Clean up the raw temporary file to save disk space
        await unlink(rawPath).catch(() => {});

        // 6. Return the URL of the processed file to the Editor
        const fileUrl = `http://${new URL(event.req.url).host}/assets/${finalFilename}`;
        return new Response(JSON.stringify({ success: true, url: fileUrl }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    } catch (err) {
        console.error('Upload handler crashed:', err);
        return new Response('Upload Error', { status: 500 });
    }
});
