'use client';

import { useEffect, useState } from 'react';

import type { EditorEngine } from '@/lib/editorEngine';
import type { LayerWithEditorState } from '@/lib/types';

export function PlaybackControls({
    layer,
    engine
}: {
    layer: Extract<LayerWithEditorState, { type: 'video' }>;
    engine: EditorEngine;
}) {
    const [status, setStatus] = useState(engine.getPlayback(layer.numericId)?.status || 'paused');

    useEffect(() => {
        const unsubscribe = engine.subscribeToPlayback((id: number, pb) => {
            if (id === layer.numericId) setStatus(pb.status);
        });
        return () => unsubscribe(); // Properly typed for void return!
    }, [layer.numericId, engine]);

    return (
        <>
            <button
                onClick={() => {
                    const playback = engine.getPlayback(layer.numericId);
                    if (playback)
                        engine.sendJSON({
                            type: 'video_seek',
                            numericId: layer.numericId,
                            mediaTime: 0,
                            playback
                        });
                }}
            >
                ⏮
            </button>
            {status === 'paused' ? (
                <button
                    style={{ width: '70px' }}
                    onClick={() =>
                        engine.sendJSON({ type: 'video_play', numericId: layer.numericId })
                    }
                >
                    ▶ Play
                </button>
            ) : (
                <button
                    style={{ width: '70px' }}
                    onClick={() =>
                        engine.sendJSON({ type: 'video_pause', numericId: layer.numericId })
                    }
                >
                    ⏸ Pause
                </button>
            )}

            <label
                style={{
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    marginLeft: '10px'
                }}
            >
                <input
                    type="checkbox"
                    checked={layer.loop ?? true}
                    onChange={(e) => {
                        const updatedConfig = { ...layer.config, loop: e.target.checked };
                        const playback = engine.getPlayback(layer.numericId);
                        if (playback)
                            engine.sendJSON({
                                type: 'upsert_layer',
                                origin: 'pbcInput',
                                layer: { ...layer, config: updatedConfig, playback }
                            });
                    }}
                />
                Loop
            </label>
        </>
    );
}
