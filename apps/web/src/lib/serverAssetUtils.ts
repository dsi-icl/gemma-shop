import { extname, join } from 'node:path';

import { encode } from 'blurhash';
import sharp from 'sharp';

import { ASSET_DIR } from './serverVariables';

const VARIANT_WIDTHS = [50, 200, 800, 1600];

/** Compute a blurhash from an image file on disk */
export async function computeBlurhash(imagePath: string): Promise<string | null> {
    try {
        const { data, info } = await sharp(imagePath)
            .resize(32, 32, { fit: 'inside' })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3);
    } catch (err) {
        console.error('[Asset] blurhash computation failed:', err);
        return null;
    }
}

/** Generate WebP variants at multiple sizes. Returns the list of widths actually generated. */
export async function generateVariants(sourcePath: string, baseId: string): Promise<number[]> {
    try {
        const meta = await sharp(sourcePath).metadata();
        const origWidth = meta.width ?? 0;
        if (origWidth === 0) return [];

        const sizes: number[] = [];

        // Generate downscaled variants (skip if original is already smaller)
        for (const width of VARIANT_WIDTHS) {
            if (origWidth <= width) continue;
            const outPath = join(ASSET_DIR, `${baseId}_${width}.webp`);
            await sharp(sourcePath)
                .resize(width, undefined, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80 })
                .toFile(outPath);
            sizes.push(width);
        }

        // Always generate a full-res WebP (unless source is already WebP)
        const srcExt = extname(sourcePath).toLowerCase();
        if (srcExt !== '.webp') {
            const outPath = join(ASSET_DIR, `${baseId}_${origWidth}.webp`);
            await sharp(sourcePath).webp({ quality: 85 }).toFile(outPath);
            sizes.push(origWidth);
        } else {
            // Source is already WebP — include original width in sizes for selection
            sizes.push(origWidth);
        }

        return sizes;
    } catch (err) {
        console.error('[Asset] variant generation failed:', err);
        return [];
    }
}
