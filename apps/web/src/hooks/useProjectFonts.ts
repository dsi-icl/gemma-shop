import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { projectAssetsQueryOptions } from '~/server/projects.queries';

const FONT_EXTENSIONS = /\.(ttf|otf|woff2?)$/i;

/** Loaded font face names, tracked to avoid duplicate loads */
const loadedFonts = new Set<string>();

export interface ProjectFont {
    name: string;
    family: string;
    url: string;
}

/**
 * Loads custom fonts from project assets into `document.fonts`.
 * Returns a list of available font families for use in the toolbar.
 */
export function useProjectFonts(projectId: string): ProjectFont[] {
    const { data: assets } = useQuery(projectAssetsQueryOptions(projectId));

    const fonts = useMemo<ProjectFont[]>(() => {
        return (assets ?? [])
            .filter((a) => FONT_EXTENSIONS.test(a.name))
            .map((a) => ({
                name: a.name,
                family: a.name.replace(/\.[^.]+$/, ''),
                url: `/api/assets/${a.url}`
            }));
    }, [assets]);

    useEffect(() => {
        for (const font of fonts) {
            if (loadedFonts.has(font.family)) continue;
            loadedFonts.add(font.family);

            const face = new FontFace(font.family, `url(${font.url})`);
            face.load()
                .then((loaded) => {
                    document.fonts.add(loaded);
                })
                .catch((err) => {
                    console.warn(`Failed to load font ${font.family}:`, err);
                    loadedFonts.delete(font.family);
                });
        }
    }, [fonts]);

    return fonts;
}
