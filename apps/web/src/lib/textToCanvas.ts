/**
 * Converts HTML content to an HTMLImageElement via foreignObject SVG.
 * Used to render text layer previews in the Konva canvas.
 */

/** CSS that mirrors the Lexical theme classes for foreignObject rendering */
const LEXICAL_CSS = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    .lexical-paragraph { margin: 0; }
    .lexical-h1 { font-size: 2.5em; font-weight: 700; margin: 0; }
    .lexical-h2 { font-size: 2em; font-weight: 600; margin: 0; }
    .lexical-h3 { font-size: 1.5em; font-weight: 600; margin: 0; }
    .lexical-h4 { font-size: 1.25em; font-weight: 600; margin: 0; }
    .lexical-bold { font-weight: 700; }
    .lexical-italic { font-style: italic; }
    .lexical-underline { text-decoration: underline; }
    .lexical-strikethrough { text-decoration: line-through; }
    .lexical-ul { list-style-type: disc; padding-left: 1.5em; margin: 0; }
    .lexical-ol { list-style-type: decimal; padding-left: 1.5em; margin: 0; }
    .lexical-li { margin: 0; }
`;

export async function textHtmlToImage(
    html: string,
    width: number,
    height: number
): Promise<HTMLImageElement> {
    const escaped = html
        // foreignObject needs well-formed XHTML
        .replace(/&(?!amp;|lt;|gt;|quot;|#\d+;|#x[\da-fA-F]+;)/g, '&amp;');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml"
                 style="width:${width}px;height:${height}px;overflow:hidden;color:white;font-family:sans-serif;font-size:48px;line-height:1.3;padding:16px;">
                <style>${LEXICAL_CSS}</style>
                ${escaped}
            </div>
        </foreignObject>
    </svg>`;

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Failed to render text to canvas'));
            img.src = url;
        });
        return img;
    } finally {
        URL.revokeObjectURL(url);
    }
}
