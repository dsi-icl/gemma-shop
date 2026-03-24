'use client';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@repo/ui/components/dialog';
import { useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { EditorEngine } from '~/lib/editorEngine';
import { useEditorStore } from '~/lib/editorStore';

import { CollaborativeEditor } from './editor/CollaborativeEditor';

interface TextEditorDialogProps {
    layerId: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function TextEditorDialog({ layerId, open, onOpenChange }: TextEditorDialogProps) {
    const textLayerMeta = useEditorStore(
        useShallow((s) => {
            const layer = s.layers.get(layerId);
            if (!layer || layer.type !== 'text') return null;
            return {
                numericId: layer.numericId,
                height: layer.config.height
            };
        })
    );
    const latestMeasuredHeightRef = useRef<number | null>(null);
    const openSyncDoneRef = useRef(false);
    const commitMeasuredHeight = (
        origin: 'editor:text_editor_open' | 'editor:text_editor_close',
        measured?: number
    ) => {
        if (typeof window === 'undefined') return;
        if (!textLayerMeta) return;
        const nextHeight = Math.max(
            40,
            Math.round(measured ?? latestMeasuredHeightRef.current ?? textLayerMeta.height)
        );
        if (Math.abs(nextHeight - textLayerMeta.height) <= 1) return;

        const liveLayer = useEditorStore.getState().layers.get(layerId);
        if (!liveLayer || liveLayer.type !== 'text') return;
        const updatedLayer = {
            ...liveLayer,
            config: { ...liveLayer.config, height: nextHeight }
        };
        useEditorStore.getState().updateLayerConfig(liveLayer.numericId, updatedLayer.config);
        const engine = EditorEngine.getInstance();
        engine.sendJSON({
            type: 'upsert_layer',
            origin,
            layer: updatedLayer
        });
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    commitMeasuredHeight('editor:text_editor_close');
                    openSyncDoneRef.current = false;
                }
                onOpenChange(nextOpen);
            }}
        >
            <DialogContent className="flex max-h-[95vh] max-w-fit flex-col gap-3 overflow-hidden p-4">
                <DialogTitle className="text-sm font-medium">Edit Text Layer</DialogTitle>
                <DialogDescription className="sr-only">Text Edit</DialogDescription>
                {open && (
                    <CollaborativeEditor
                        layerId={layerId}
                        onMeasuredHeight={(height) => {
                            latestMeasuredHeightRef.current = height;
                            if (open && !openSyncDoneRef.current) {
                                commitMeasuredHeight('editor:text_editor_open', height);
                                openSyncDoneRef.current = true;
                            }
                        }}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}
