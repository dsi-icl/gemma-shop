import { createFileRoute } from '@tanstack/react-router';
import satori from 'satori';

import fontDataURI from '~/assets/NotoSans-Regular.ttf?raw-hex';
import mathDataURI from '~/assets/NotoSansMath-Regular.ttf?raw-hex';
import { OGCard } from '~/components/og-card';

export const Route = createFileRoute('/og')({
    server: {
        handlers: {
            GET: async (s) => {
                const { searchParams } = new URL(s.request.url);
                const width = 1760 / 2;
                const height = 800 / 2;
                const fontData = Buffer.from(fontDataURI, 'hex');
                const mathData = Buffer.from(mathDataURI, 'hex');
                const svg = await satori(
                    await OGCard({ width, height, params: Object.fromEntries(searchParams) }),
                    {
                        width,
                        height,
                        fonts: [
                            {
                                name: 'Noto Sans',
                                data: fontData
                            },
                            {
                                name: 'Noto Math',
                                data: mathData
                            }
                        ]
                    }
                );

                return new Response(svg, {
                    headers: {
                        'Content-Type': 'image/svg+xml',
                        'Content-Disposition': 'filename="og.svg"'
                    }
                });
            }
        }
    }
});
