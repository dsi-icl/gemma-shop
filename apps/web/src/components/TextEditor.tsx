'use client';

import { asyncDebounce } from '@tanstack/pacer';
import { useState } from 'react';

import type { EditorEngine } from '~/lib/editorEngine';
import type { LayerWithEditorState } from '~/lib/types';

export function TextEditor({
    layer,
    engine
}: {
    layer: Extract<LayerWithEditorState, { type: 'text' }>;
    engine: EditorEngine;
}) {
    const [text, setText] = useState(layer.markdown);

    const handleTextChange = asyncDebounce(
        async (e: React.ChangeEvent<HTMLTextAreaElement, HTMLTextAreaElement>) => {
            const newText = e.target.value;

            // const { url, w, h } = (await renderTextToSVG(newText)) ?? {};
            // if (!url) return;

            layer.markdown = newText;
            // layer.config.h = h ?? 100;
            // layer.config.w = w ?? 100;
            // layer.url = url;
            setText(e.target.value);
            engine.sendJSON({
                type: 'upsert_layer',
                origin: 'handleTextChange',
                layer: { ...layer, config: { ...layer.config }, markdown: newText }
            });
        },
        { wait: 500 }
    );

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '300px' }}>
            <textarea
                defaultValue={text}
                onChange={handleTextChange}
                style={{ flexGrow: 1, cursor: 'pointer' }}
            />
        </div>
    );
}
