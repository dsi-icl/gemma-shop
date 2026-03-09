'use client';

import { useEffect, useRef } from 'react';

import type { EditorEngine } from '~/lib/editorEngine';
import type { LayerWithEditorState } from '~/lib/types';

export function VideoScrubber({
    layer,
    engine
}: {
    layer: Extract<LayerWithEditorState, { type: 'video' }>;
    engine: EditorEngine;
}) {
    const seekInputRef = useRef<HTMLInputElement>(null);
    const spanRef = useRef<HTMLSpanElement>(null);
    const isDragging = useRef(false);
    const hasTriggeredEnd = useRef(false);
    const pbRef = useRef(engine.getPlayback(layer.numericId) || layer.playback);

    useEffect(() => {
        const unsubscribe = engine.subscribeToPlayback((id: number, pb) => {
            if (id === layer.numericId) pbRef.current = pb;
        });
        return () => unsubscribe();
    }, [layer.numericId, engine]);

    useEffect(() => {
        let frameId: number;
        const loop = () => {
            const pb = pbRef.current;
            if (pb && seekInputRef.current && spanRef.current) {
                let currentTime = pb.anchorMediaTime || 0;

                if (pb.status === 'playing') {
                    const now = engine.getServerTime();
                    let expected =
                        pb.anchorMediaTime + Math.max(0, (now - pb.anchorServerTime) / 1000);

                    if (layer.loop ?? true) {
                        if (layer.duration) expected = expected % layer.duration;
                    } else if (expected >= (layer.duration || 0)) {
                        expected = layer.duration || 0;
                    }
                    currentTime = expected;
                } else {
                    hasTriggeredEnd.current = false;
                    if (layer.duration) currentTime = currentTime % layer.duration;
                }

                if (!isDragging.current) {
                    seekInputRef.current.value = currentTime.toString();
                    spanRef.current.innerText = `${currentTime.toFixed(1)}s`;
                }
            }
            frameId = requestAnimationFrame(loop);
        };
        frameId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frameId);
    }, [layer.duration, layer.loop, layer.numericId, engine]);

    const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
        if (spanRef.current)
            spanRef.current.innerText = `${parseFloat(e.currentTarget.value).toFixed(1)}s`;
    };

    const handleSeek = () => {
        isDragging.current = false;
        if (seekInputRef.current) {
            const playback = engine.getPlayback(layer.numericId);
            if (playback)
                engine.sendJSON({
                    type: 'video_seek',
                    numericId: layer.numericId,
                    mediaTime: parseFloat(seekInputRef.current.value),
                    playback
                });
        }
    };

    const safeTime = pbRef.current?.anchorMediaTime || 0;

    return (
        <div className="flex w-48 items-center gap-2">
            <span
                ref={spanRef}
                className="w-10 font-mono text-xs text-muted-foreground tabular-nums"
            >
                {safeTime.toFixed(1)}s
            </span>
            <input
                ref={seekInputRef}
                type="range"
                min="0"
                max={layer.duration || 100}
                step="0.01"
                defaultValue={safeTime}
                onPointerDown={() => {
                    isDragging.current = true;
                }}
                onInput={handleInput}
                onPointerUp={handleSeek}
                className="h-1.5 flex-1 cursor-pointer accent-primary"
            />
        </div>
    );
}
