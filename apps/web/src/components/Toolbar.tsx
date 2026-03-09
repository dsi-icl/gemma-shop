import {
    ArrowLineDownIcon,
    ArrowLineUpIcon,
    ArrowsClockwiseIcon,
    EraserIcon,
    MapPinIcon,
    PencilSimpleIcon,
    TextTIcon,
    TrashIcon,
    UploadSimpleIcon
} from '@phosphor-icons/react';
import { Button } from '@repo/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@repo/ui/components/popover';
import { Separator } from '@repo/ui/components/separator';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from '@repo/ui/components/tooltip';

import { PlaybackControls } from '~/components/PlaybackControls';
import { TextEditor } from '~/components/TextEditor';
import { VideoScrubber } from '~/components/VideoScrubber';
import type { EditorEngine } from '~/lib/editorEngine';
import type { LayerWithEditorState } from '~/lib/types';

interface ToolbarProps {
    selectedId: string | null;
    layers: LayerWithEditorState[];
    engine: EditorEngine;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onAddText: () => void;
    onAddMap: () => void;
    onBringToFront: () => void;
    onSendToBack: () => void;
    onDeleteLayer: () => void;
    onClearStage: () => void;
    onReboot: () => void;
}

function TipButton({
    tip,
    children,
    ...props
}: { tip: string } & React.ComponentProps<typeof Button>) {
    return (
        <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" {...props} />}>
                {children}
            </TooltipTrigger>
            <TooltipContent side="top">{tip}</TooltipContent>
        </Tooltip>
    );
}

export function Toolbar({
    selectedId,
    layers,
    engine,
    fileInputRef,
    onUpload,
    onAddText,
    onAddMap,
    onBringToFront,
    onSendToBack,
    onDeleteLayer,
    onClearStage,
    onReboot
}: ToolbarProps) {
    const activeLayer = selectedId
        ? layers.find((l) => l.numericId === parseInt(selectedId))
        : null;
    const isVideo = activeLayer?.type === 'video';
    const isText = activeLayer?.type === 'text';

    return (
        <TooltipProvider>
            <div
                id="toolbar"
                className="flex items-center gap-1 border-t border-border bg-card/50 px-2 py-1"
            >
                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4, image/*"
                    onChange={onUpload}
                    className="hidden"
                />

                {/* ── Add Content ── */}
                <div className="flex items-center gap-0.5">
                    <TipButton tip="Upload media" onClick={() => fileInputRef.current?.click()}>
                        <UploadSimpleIcon />
                    </TipButton>
                    <TipButton tip="Add text layer" onClick={onAddText}>
                        <TextTIcon />
                    </TipButton>
                    <TipButton tip="Add map layer" onClick={onAddMap}>
                        <MapPinIcon />
                    </TipButton>
                </div>

                {/* ── Layer Ordering ── */}
                {activeLayer && (
                    <>
                        <Separator orientation="vertical" className="mx-1 h-6" />
                        <div className="flex items-center gap-0.5">
                            <TipButton tip="Bring to front" onClick={onBringToFront}>
                                <ArrowLineUpIcon />
                            </TipButton>
                            <TipButton tip="Send to back" onClick={onSendToBack}>
                                <ArrowLineDownIcon />
                            </TipButton>
                            <TipButton
                                tip="Delete layer"
                                variant="destructive"
                                onClick={onDeleteLayer}
                            >
                                <TrashIcon />
                            </TipButton>
                        </div>
                    </>
                )}

                {/* ── Video Playback ── */}
                {isVideo && activeLayer && (
                    <>
                        <Separator orientation="vertical" className="mx-1 h-6" />
                        <PlaybackControls
                            key={`pc_${activeLayer.numericId}`}
                            layer={activeLayer as Extract<LayerWithEditorState, { type: 'video' }>}
                            engine={engine}
                        />
                        <Separator orientation="vertical" className="mx-1 h-6" />
                        <VideoScrubber
                            key={`vs_${activeLayer.numericId}`}
                            layer={activeLayer as Extract<LayerWithEditorState, { type: 'video' }>}
                            engine={engine}
                        />
                    </>
                )}

                {/* ── Text Editor (popover) ── */}
                {isText && activeLayer && (
                    <>
                        <Separator orientation="vertical" className="mx-1 h-6" />
                        <Popover>
                            <Tooltip>
                                <TooltipTrigger
                                    render={
                                        <PopoverTrigger
                                            render={<Button variant="ghost" size="icon-sm" />}
                                        />
                                    }
                                >
                                    <PencilSimpleIcon />
                                </TooltipTrigger>
                                <TooltipContent side="top">Edit text</TooltipContent>
                            </Tooltip>
                            <PopoverContent side="top" className="w-80">
                                <TextEditor
                                    key={`te_${activeLayer.numericId}`}
                                    layer={
                                        activeLayer as Extract<
                                            LayerWithEditorState,
                                            { type: 'text' }
                                        >
                                    }
                                    engine={engine}
                                />
                            </PopoverContent>
                        </Popover>
                    </>
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* ── Danger Zone ── */}
                <div className="flex items-center gap-0.5">
                    <TipButton tip="Clear all layers" variant="destructive" onClick={onClearStage}>
                        <EraserIcon />
                    </TipButton>
                    <TipButton tip="Refresh all screens" variant="destructive" onClick={onReboot}>
                        <ArrowsClockwiseIcon />
                    </TipButton>
                </div>
            </div>
        </TooltipProvider>
    );
}
