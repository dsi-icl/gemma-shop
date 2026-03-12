import {
    ArrowLineDownIcon,
    ArrowLineUpIcon,
    ArrowsClockwiseIcon,
    CircleIcon,
    EraserIcon,
    GridNineIcon,
    ImageIcon,
    MapPinIcon,
    PencilSimpleIcon,
    RectangleIcon,
    ShapesIcon,
    TextTIcon
} from '@phosphor-icons/react';
import { Button } from '@repo/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@repo/ui/components/popover';
import { Separator } from '@repo/ui/components/separator';
import { TipButton } from '@repo/ui/components/tip-button';
import { TooltipProvider } from '@repo/ui/components/tooltip';

import { InkToolbar } from '~/components/InkToolbar';
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

export function Toolbar({ fileInputRef, onUpload }: ToolbarProps) {
    const {
        selectedLayerIds,
        layers,
        addTextLayer,
        addMapLayer,
        addShapeLayer,
        bringToFront,
        sendToBack,
        clearStage,
        reboot
    } = useEditorStore();
    const showGrid = useEditorStore((s) => s.showGrid);
    const toggleGrid = useEditorStore((s) => s.toggleGrid);
    const isDrawing = useEditorStore((s) => s.isDrawing);
    const toggleDrawing = useEditorStore((s) => s.toggleDrawing);
    const selectedId = selectedLayerIds[0];

    const engine = EditorEngine.getInstance();

    const activeLayer = selectedId
        ? layers.find((l) => l.numericId === parseInt(selectedId))
        : null;
    const isVideo = activeLayer?.type === 'video';
    const isText = activeLayer?.type === 'text';
    const isShape = activeLayer?.type === 'shape';
    const isInk = activeLayer?.type === 'ink';

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
                        <ImageIcon />
                    </TipButton>
                    <Popover>
                        <PopoverTrigger>
                            <TipButton tip="Add shape">
                                <ShapesIcon />
                            </TipButton>
                        </PopoverTrigger>
                        <PopoverContent side="top" className="w-auto p-1">
                            <div className="flex gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        addShapeLayer('rectangle');
                                    }}
                                >
                                    <RectangleIcon />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        addShapeLayer('circle');
                                    }}
                                >
                                    <CircleIcon />
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                    <TipButton tip="Add text layer" onClick={addTextLayer}>
                        <TextTIcon />
                    </TipButton>
                    <TipButton tip="Add map layer" onClick={addMapLayer}>
                        <MapPinIcon />
                    </TipButton>
                    <TipButton
                        tip="Draw"
                        onClick={toggleDrawing}
                        variant={isDrawing ? 'outline' : 'ghost'}
                    >
                        <PencilSimpleIcon />
                    </TipButton>
                </div>

                {/* ── Ink ── */}
                {isDrawing || isInk || isShape ? (
                    <>
                        <Separator orientation="vertical" className="mx-1 h-6" />
                        <InkToolbar />
                    </>
                ) : null}

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

                <div className="grow" />

                {/* Spacer */}
                <div className="flex-1" />

                {/* ── Danger Zone ── */}
                <div className="flex items-center gap-0.5">
                    <TipButton
                        tip={showGrid ? 'Hide Grid' : 'Show Grid'}
                        variant={showGrid ? 'outline' : 'ghost'}
                        onClick={toggleGrid}
                    >
                        <GridNineIcon weight={showGrid ? 'fill' : 'regular'} />
                    </TipButton>
                    <TipButton tip="Refresh all screens" variant="ghost" onClick={reboot}>
                        <ArrowsClockwiseIcon />
                    </TipButton>
                    <TipButton tip="Clear all layers" variant="destructive" onClick={clearStage}>
                        <EraserIcon />
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
