import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { projectAssetsQueryOptions } from '~/server/projects.queries';

const FONT_EXTENSIONS = /\.woff2$/i;

/** Loaded font-face keys, tracked to avoid duplicate loads */
const loadedFonts = new Set<string>();

export interface FontAsset {
    name: string;
    family: string;
    url: string;
}

function normalizeFamilyFromName(name: string): string {
    return name.replace(/\.[^.]+$/, '');
}

/**
 * Loads project + public WOFF2 fonts from asset records into `document.fonts`.
 * Returns a list of available font families for toolbar usage.
 */
export function useFonts(projectId: string | null | undefined): FontAsset[] {
    const { data: assets } = useQuery({
        ...projectAssetsQueryOptions(projectId ?? ''),
        enabled: Boolean(projectId)
    });

    const fonts = useMemo<FontAsset[]>(() => {
        if (!projectId) return [];
        return (assets ?? [])
            .filter((a) => FONT_EXTENSIONS.test(a.name) || a.mimeType === 'font/woff2')
            .map((a) => ({
                name: a.name,
                family: normalizeFamilyFromName(a.name),
                url: `/api/assets/${a.url}`
            }));
    }, [assets, projectId]);

    useEffect(() => {
        for (const font of fonts) {
            const key = `${font.family}|${font.url}`;
            if (loadedFonts.has(key)) continue;
            loadedFonts.add(key);

            const face = new FontFace(font.family, `url(${font.url}) format('woff2')`);
            face.load()
                .then((loaded) => {
                    document.fonts.add(loaded);
                })
                .catch((err) => {
                    console.warn(`Failed to load font ${font.family}:`, err);
                    loadedFonts.delete(key);
                });
        }
    }, [fonts]);

    return fonts;
}
