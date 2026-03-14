import {
    ArrowLineDownIcon,
    ArrowLineUpIcon,
    ArrowsClockwiseIcon,
    ArrowsInLineHorizontalIcon,
    CheckCircleIcon,
    CircleIcon,
    CircleNotchIcon,
    EraserIcon,
    FloppyDiskIcon,
    GridNineIcon,
    ImageIcon,
    MapPinIcon,
    MonitorIcon,
    PencilSimpleIcon,
    RectangleIcon,
    ShapesIcon,
    TextTIcon,
    WarningCircleIcon
} from '@phosphor-icons/react';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Popover, PopoverContent, PopoverTrigger } from '@repo/ui/components/popover';
import { Separator } from '@repo/ui/components/separator';
import { TipButton } from '@repo/ui/components/tip-button';
import { TooltipProvider } from '@repo/ui/components/tooltip';
import { useRef, useState } from 'react';

import { InkToolbar } from '~/components/InkToolbar';
import { PlaybackControls } from '~/components/PlaybackControls';
import { TextEditor } from '~/components/TextEditor';
import { VideoScrubber } from '~/components/VideoScrubber';
import { WallPickerPopover } from '~/components/WallPicker';
import { EditorEngine } from '~/lib/editorEngine';
import { useEditorStore } from '~/lib/editorStore';
import type { LayerWithEditorState } from '~/lib/types';

interface ToolbarProps {
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function Toolbar({ fileInputRef, onUpload }: ToolbarProps) {
    const {
        projectId,
        activeSlideId,
        selectedLayerIds,
        layers,
        isSnapping,
        toggleSnapping,
        addTextLayer,
        addMapLayer,
        addShapeLayer,
        bringToFront,
        sendToBack,
        clearStage,
        reboot,
        saveProject
    } = useEditorStore();
    const boundWallId = useEditorStore((s) => s.boundWallId);
    const showGrid = useEditorStore((s) => s.showGrid);
    const toggleGrid = useEditorStore((s) => s.toggleGrid);
    const isDrawing = useEditorStore((s) => s.isDrawing);
    const toggleDrawing = useEditorStore((s) => s.toggleDrawing);
    const saveStatus = useEditorStore((s) => s.saveStatus);
    const selectedId = selectedLayerIds[0];

    const engine = EditorEngine.getInstance();

    const activeLayer = selectedId
        ? layers.find((l) => l.numericId === parseInt(selectedId))
        : null;
    const isVideo = activeLayer?.type === 'video';
    const isText = activeLayer?.type === 'text';
    const isShape = activeLayer?.type === 'shape';
    const isInk = activeLayer?.type === 'ink';

    // Save popover state
    const [commitMessage, setCommitMessage] = useState('');
    const [savePopoverOpen, setSavePopoverOpen] = useState(false);
    const commitInputRef = useRef<HTMLInputElement>(null);

    const handleManualSave = () => {
        const msg = commitMessage.trim() || 'Manual save';
        setSavePopoverOpen(false);
        setCommitMessage('');
        saveProject(msg);
    };

    const handleWallSelect = (wallId: string) => {
        if (!projectId || !activeSlideId) return;
        engine.bindWall(wallId, projectId, activeSlideId);
        useEditorStore.setState({ boundWallId: wallId });
    };

    const handleWallUnbind = () => {
        engine.unbindWall();
        useEditorStore.setState({ boundWallId: null });
    };

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
                        <PopoverTrigger nativeButton={false} render={<div />}>
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
                {isVideo && activeLayer && !activeLayer.isUploading && (
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

                {/* ── Save status text ── */}
                {saveStatus === 'dirty' && (
                    <span className="text-xs text-muted-foreground">Unsaved</span>
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* ── Live Preview ── */}
                {boundWallId ? (
                    <TipButton tip="Disconnect wall" variant="outline" onClick={handleWallUnbind}>
                        <MonitorIcon weight="fill" className="text-green-500" />
                    </TipButton>
                ) : (
                    <WallPickerPopover
                        onSelect={handleWallSelect}
                        trigger={
                            <TipButton tip="Launch live preview">
                                <MonitorIcon />
                            </TipButton>
                        }
                    />
                )}
                {/* ── Save ── */}
                <div className="flex items-center gap-0.5">
                    <Popover open={savePopoverOpen} onOpenChange={setSavePopoverOpen}>
                        <PopoverTrigger nativeButton={false} render={<div />}>
                            <TipButton
                                tip={
                                    saveStatus === 'dirty'
                                        ? 'Unsaved changes — click to save'
                                        : saveStatus === 'saving'
                                          ? 'Saving...'
                                          : saveStatus === 'saved'
                                            ? 'Saved'
                                            : saveStatus === 'error'
                                              ? 'Save failed — click to retry'
                                              : 'Save project'
                                }
                                variant={
                                    saveStatus === 'dirty' || saveStatus === 'error'
                                        ? 'outline'
                                        : 'ghost'
                                }
                                disabled={saveStatus === 'saving'}
                            >
                                {saveStatus === 'saving' ? (
                                    <CircleNotchIcon className="animate-spin" />
                                ) : saveStatus === 'saved' ? (
                                    <CheckCircleIcon weight="fill" className="text-green-500" />
                                ) : saveStatus === 'error' ? (
                                    <WarningCircleIcon weight="fill" className="text-destructive" />
                                ) : (
                                    <FloppyDiskIcon
                                        weight={saveStatus === 'dirty' ? 'fill' : 'regular'}
                                    />
                                )}
                            </TipButton>
                        </PopoverTrigger>
                        <PopoverContent side="top" className="w-72 p-3">
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    handleManualSave();
                                }}
                                className="flex flex-col gap-2"
                            >
                                <label className="text-xs font-medium text-muted-foreground">
                                    Commit message
                                </label>
                                <Input
                                    ref={commitInputRef}
                                    value={commitMessage}
                                    onChange={(e) => setCommitMessage(e.target.value)}
                                    placeholder="Describe your changes..."
                                    autoFocus
                                />
                                <Button type="submit" size="sm" disabled={saveStatus === 'saving'}>
                                    {saveStatus === 'saving' ? 'Saving...' : 'Save version'}
                                </Button>
                            </form>
                        </PopoverContent>
                    </Popover>
                </div>
                <Separator orientation="vertical" className="mx-1 h-6" />

                {/* ── Danger Zone ── */}
                <div className="flex items-center gap-0.5">
                    <TipButton
                        tip={isSnapping ? 'Disable Snap' : 'Enable Snap'}
                        variant={isSnapping ? 'outline' : 'ghost'}
                        onClick={toggleSnapping}
                    >
                        <ArrowsInLineHorizontalIcon weight={showGrid ? 'fill' : 'regular'} />
                    </TipButton>
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
