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
import { EditorEngine } from '~/lib/editorEngine';
import { useEditorStore } from '~/lib/editorStore';
import type { LayerWithEditorState } from '~/lib/types';

interface ToolbarProps {
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
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

export function Toolbar({ fileInputRef, onUpload }: ToolbarProps) {
    const {
        selectedLayerIds,
        layers,
        addTextLayer,
        addMapLayer,
        bringToFront,
        sendToBack,
        deleteSelectedLayer,
        clearStage,
        reboot
    } = useEditorStore();
    const selectedId = selectedLayerIds[0];

    const engine = EditorEngine.getInstance();

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
                    <TipButton tip="Add text layer" onClick={addTextLayer}>
                        <TextTIcon />
                    </TipButton>
                    <TipButton tip="Add map layer" onClick={addMapLayer}>
                        <MapPinIcon />
                    </TipButton>
                </div>

                {/* ── Layer Ordering ── */}
                {activeLayer && (
                    <>
                        <Separator orientation="vertical" className="mx-1 h-6" />
                        <div className="flex items-center gap-0.5">
                            <TipButton tip="Bring to front" onClick={bringToFront}>
                                <ArrowLineUpIcon />
                            </TipButton>
                            <TipButton tip="Send to back" onClick={sendToBack}>
                                <ArrowLineDownIcon />
                            </TipButton>
                            <TipButton
                                tip="Delete layer"
                                variant="destructive"
                                onClick={deleteSelectedLayer}
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

                {/* Spacer */}
                <div className="flex-1" />

                {/* ── Danger Zone ── */}
                <div className="flex items-center gap-0.5">
                    <TipButton tip="Clear all layers" variant="destructive" onClick={clearStage}>
                        <EraserIcon />
                    </TipButton>
                    <TipButton tip="Refresh all screens" variant="destructive" onClick={reboot}>
                        <ArrowsClockwiseIcon />
                    </TipButton>
                </div>
            </div>
            {isText && activeLayer && (
                <TextEditor
                    key={`te_${activeLayer.numericId}`}
                    layer={activeLayer as Extract<LayerWithEditorState, { type: 'text' }>}
                    engine={engine}
                />
            )}
        </TooltipProvider>
    );
}
