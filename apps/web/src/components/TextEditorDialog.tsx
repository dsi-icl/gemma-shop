'use client';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@repo/ui/components/dialog';
import { useRef } from 'react';

import { EditorEngine } from '~/lib/editorEngine';
import { useEditorStore } from '~/lib/editorStore';

import { CollaborativeEditor } from './editor/CollaborativeEditor';

interface TextEditorDialogProps {
    layerId: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function TextEditorDialog({ layerId, open, onOpenChange }: TextEditorDialogProps) {
    const layer = useEditorStore((s) => s.layers.get(layerId));
    const latestMeasuredHeightRef = useRef<number | null>(null);
    const openSyncDoneRef = useRef(false);
    const engine = EditorEngine.getInstance();

    const isText = layer?.type === 'text';

    const commitMeasuredHeight = (
        origin: 'text_editor_open' | 'text_editor_close',
        measured?: number
    ) => {
        if (!isText) return;
        const nextHeight = Math.max(
            40,
            Math.round(measured ?? latestMeasuredHeightRef.current ?? layer.config.height)
        );
        if (Math.abs(nextHeight - layer.config.height) <= 1) return;

        const updatedLayer = { ...layer, config: { ...layer.config, height: nextHeight } };
        useEditorStore.getState().updateLayerConfig(layer.numericId, updatedLayer.config);
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
                    commitMeasuredHeight('text_editor_close');
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
                                commitMeasuredHeight('text_editor_open', height);
                                openSyncDoneRef.current = true;
                            }
                        }}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}
