import {
    ArrowLineDownIcon,
    ArrowLineUpIcon,
    ArrowsClockwiseIcon,
    ArrowsInLineHorizontalIcon,
    CameraIcon,
    CheckCircleIcon,
    CircleIcon,
    CircleNotchIcon,
    DropHalfIcon,
    DropSlashIcon,
    EraserIcon,
    FloppyDiskIcon,
    GlobeSimpleIcon,
    GridNineIcon,
    ImageIcon,
    LightningIcon,
    LightningSlashIcon,
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
import { Slider } from '@repo/ui/components/slider';
import { TipButton } from '@repo/ui/components/tip-button';
import { TooltipProvider } from '@repo/ui/components/tooltip';
import { throttle } from '@tanstack/pacer';
import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';

import { AppearanceToolbar } from '~/components/AppearanceToolbar';
import { PlaybackControls } from '~/components/PlaybackControls';
import { SlidesJsonDialog } from '~/components/SlidesJsonDialog';
import { VideoScrubber } from '~/components/VideoScrubber';
import { WallPickerPopover } from '~/components/WallPicker';
import { EditorEngine } from '~/lib/editorEngine';
import { useEditorStore } from '~/lib/editorStore';
import { FILTER_PRESETS, normalizeLayerFilters, toCssFilterString } from '~/lib/layerFilters';
import type { LayerFilterState, LayerWithEditorState } from '~/lib/types';

interface EditorToolbarProps {
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    // onEditText?: (layerId: number) => void;
}

export function EditorToolbar({ fileInputRef, onUpload }: EditorToolbarProps) {
    // Project header — only changes on project load
    const { projectName, parentSaveMessage } = useEditorStore(
        useShallow((s) => ({ projectName: s.projectName, parentSaveMessage: s.parentSaveMessage }))
    );

    // Save / connection state — infrequent, independent
    const saveStatus = useEditorStore((s) => s.saveStatus);
    const boundWallId = useEditorStore((s) => s.boundWallId);

    // Tool toggle state — batched since they often change together
    const { showGrid, isDrawing, isSnapping } = useEditorStore(
        useShallow((s) => ({
            showGrid: s.showGrid,
            isDrawing: s.isDrawing,
            isSnapping: s.isSnapping
        }))
    );

    // Derived active layer — re-renders only when the selected layer's own data changes,
    // not on every other layer mutation
    const activeLayer = useEditorStore((s) => {
        const id = s.selectedLayerIds[0];
        return id ? (s.layers.get(parseInt(id)) ?? null) : null;
    });

    // Actions — stable references across renders, never trigger re-renders on their own
    const { toggleSnapping, toggleDrawing, toggleGrid, startTextEditing } = useEditorStore(
        useShallow((s) => ({
            toggleSnapping: s.toggleSnapping,
            toggleDrawing: s.toggleDrawing,
            toggleGrid: s.toggleGrid,
            startTextEditing: s.startTextEditing
        }))
    );
    const {
        addTextLayer,
        addMapLayer,
        addWebLayer,
        addShapeLayer,
        bringToFront,
        sendToBack,
        clearStage,
        reboot,
        saveProject
    } = useEditorStore(
        useShallow((s) => ({
            addTextLayer: s.addTextLayer,
            addMapLayer: s.addMapLayer,
            addWebLayer: s.addWebLayer,
            addShapeLayer: s.addShapeLayer,
            bringToFront: s.bringToFront,
            sendToBack: s.sendToBack,
            clearStage: s.clearStage,
            reboot: s.reboot,
            saveProject: s.saveProject
        }))
    );

    const engine = useMemo(
        () => (typeof window !== 'undefined' ? EditorEngine.getInstance() : null),
        []
    );

    const isVideo = activeLayer?.type === 'video';
    const isText = activeLayer?.type === 'text';
    const isShape = activeLayer?.type === 'shape';
    const isLine = activeLayer?.type === 'line';
    const isWeb = activeLayer?.type === 'web';
    const activeFilters = normalizeLayerFilters(activeLayer?.config.filters);

    const activeLayerPreviewUrl = useMemo(() => {
        if (!activeLayer) return null;
        if (activeLayer.type === 'image') return activeLayer.url;
        if (activeLayer.type === 'video') {
            if (activeLayer.stillImage) return `/api/assets/${activeLayer.stillImage}`;
            const filename = activeLayer.url.split('/').pop() ?? '';
            const base = filename.replace(/\.[^.]+$/, '');
            return base ? `/api/assets/${base}.jpg` : null;
        }
        if (activeLayer.type === 'web' && activeLayer.stillImage) {
            return `/api/assets/${activeLayer.stillImage}`;
        }
        return null;
    }, [activeLayer]);

    // Save popover state
    const [commitMessage, setCommitMessage] = useState('');
    const [savePopoverOpen, setSavePopoverOpen] = useState(false);
    const [jsonDialogOpen, setJsonDialogOpen] = useState(false);
    const commitInputRef = useRef<HTMLInputElement>(null);

    const handleManualSave = () => {
        const msg = commitMessage.trim() || 'Manual save';
        setSavePopoverOpen(false);
        setCommitMessage('');
        saveProject(msg);
    };

    const [webUrl, setWebUrl] = useState('');
    const [isCapturing, setIsCapturing] = useState(false);

    // Keep local webUrl in sync when selection changes
    const activeWebUrl = isWeb && activeLayer ? activeLayer.url : '';
    if (webUrl !== activeWebUrl && !isCapturing) {
        setWebUrl(activeWebUrl);
    }

    const throttledWebUrlBroadcast = useRef(
        throttle(
            (layer: LayerWithEditorState) => {
                const engine = EditorEngine.getInstance();
                engine.sendJSON({ type: 'upsert_layer', origin: 'editor:toolbar_web_url', layer });
                useEditorStore.getState().markDirty();
            },
            { wait: 500 }
        )
    );

    const throttledFilterBroadcast = useRef(
        throttle(
            (layer: LayerWithEditorState) => {
                const engine = EditorEngine.getInstance();
                engine.sendJSON({ type: 'upsert_layer', origin: 'editor:toolbar_filters', layer });
                useEditorStore.getState().markDirty();
            },
            { wait: 120 }
        )
    );

    const handleWebUrlChange = useCallback(
        (value: string) => {
            if (!activeLayer || activeLayer.type !== 'web') return;
            setWebUrl(value);
            const updatedLayer = { ...activeLayer, url: value };
            useEditorStore.setState((s) => {
                const newLayers = new Map(s.layers);
                newLayers.set(activeLayer.numericId, updatedLayer);
                return { layers: newLayers };
            });
            throttledWebUrlBroadcast.current(updatedLayer);
        },
        [activeLayer]
    );

    const handleWebProxyToggle = useCallback(() => {
        if (!activeLayer || activeLayer.type !== 'web') return;
        const updatedLayer = { ...activeLayer, proxy: !activeLayer.proxy };
        useEditorStore.getState().upsertLayer(updatedLayer);
        const engine = EditorEngine.getInstance();
        engine.sendJSON({
            type: 'upsert_layer',
            origin: 'editor:toolbar_web_proxy_toggle',
            layer: updatedLayer
        });
        useEditorStore.getState().markDirty();
    }, [activeLayer]);

    const captureScreenshot = useCallback(async () => {
        if (!activeLayer || activeLayer.type !== 'web' || !activeLayer.url) return;
        setIsCapturing(true);
        try {
            const res = await fetch('/api/web-screenshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: activeLayer.url,
                    width: activeLayer.config.width,
                    height: activeLayer.config.height,
                    scale: activeLayer.scale,
                    previousBaseId: activeLayer.stillImage
                        ? activeLayer.stillImage.replace(/\.[^.]+$/, '')
                        : undefined
                })
            });
            if (!res.ok) {
                const payload = (await res.json().catch(() => null)) as { error?: string } | null;
                throw new Error(payload?.error || `Screenshot capture failed (${res.status})`);
            }
            const { filename, blurhash, sizes } = await res.json();

            const updatedLayer = {
                ...activeLayer,
                stillImage: filename,
                blurhash: blurhash ?? undefined,
                sizes: sizes?.length ? sizes : undefined
            };
            useEditorStore.getState().upsertLayer(updatedLayer);
            const engine = EditorEngine.getInstance();
            engine.sendJSON({
                type: 'upsert_layer',
                origin: 'editor:capture_screenshot',
                layer: updatedLayer
            });
            useEditorStore.getState().markDirty();
            toast.success('Screenshot captured');
        } catch (err: any) {
            toast.error(err.message || 'Failed to capture screenshot');
        } finally {
            setIsCapturing(false);
        }
    }, [activeLayer]);

    const updateActiveLayerFilters = useCallback(
        (updater: (current: LayerFilterState) => LayerFilterState) => {
            if (!activeLayer) return;
            const current = normalizeLayerFilters(activeLayer.config.filters);
            const next = updater(current);
            const updatedLayer = {
                ...activeLayer,
                config: { ...activeLayer.config, filters: next }
            };
            useEditorStore.getState().upsertLayer(updatedLayer);
            throttledFilterBroadcast.current(updatedLayer);
        },
        [activeLayer]
    );

    const handleWallSelect = (wallId: string) => {
        if (!engine) return;
        const { projectId, commitId, activeSlideId } = useEditorStore.getState();
        if (!projectId || !commitId || !activeSlideId) return;
        engine.bindWall(wallId, projectId, commitId, activeSlideId);
    };

    const handleWallUnbind = () => {
        if (!engine) return;
        engine.unbindWall();
        useEditorStore.setState({ boundWallId: null });
    };

    return (
        <TooltipProvider>
            <div
                id="titlebar"
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
                    <TipButton tip="Upload assets" onClick={() => fileInputRef.current?.click()}>
                        <ImageIcon />
                    </TipButton>
                    <Popover>
                        <PopoverTrigger nativeButton={false} render={<div />}>
                            <TipButton tip="Add shape">
                                <ShapesIcon />
                            </TipButton>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-1" side="bottom" align="start">
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
                    <TipButton tip="Add web layer" onClick={addWebLayer}>
                        <GlobeSimpleIcon />
                    </TipButton>
                    <TipButton
                        tip="Draw"
                        onClick={toggleDrawing}
                        variant={isDrawing ? 'outline' : 'ghost'}
                    >
                        <PencilSimpleIcon />
                    </TipButton>
                </div>

                <div className="w-full grow text-center text-xs text-muted-foreground">
                    {projectName} - {parentSaveMessage}
                    {/* ── Save status text ── */}
                    {saveStatus === 'dirty' && <span> - Unsaved</span>}
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                <TipButton tip="Extract JSON" onClick={() => setJsonDialogOpen(true)}>
                    <span className="font-mono text-xs">{'{}'}</span>
                </TipButton>

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
                        <PopoverContent className="w-72 p-3" side="bottom" align="start">
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
                <Separator orientation="vertical" className="mx-1 my-1 h-6" />

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
            <div
                id="toolbar"
                className="flex h-11 min-h-11 items-center gap-1 border-t border-b border-border bg-card/50 px-2 py-1"
            >
                {activeLayer ? (
                    <span className="px-2 text-xs">{activeLayer.type}</span>
                ) : (
                    <span className="px-2 text-xs text-muted-foreground">
                        Select a layer to access tools
                    </span>
                )}

                {/* ── Layer Ordering ── */}
                {activeLayer && (
                    <>
                        <Separator orientation="vertical" className="mx-1 my-1 h-6" />
                        <div className="flex items-center gap-0.5">
                            <TipButton tip="Bring to front" onClick={bringToFront}>
                                <ArrowLineUpIcon />
                            </TipButton>
                            <TipButton tip="Send to back" onClick={sendToBack}>
                                <ArrowLineDownIcon />
                            </TipButton>
                        </div>
                        <Popover>
                            <PopoverTrigger nativeButton={false} render={<div />}>
                                <TipButton
                                    tip="Layer filters"
                                    variant={activeFilters.enabled ? 'outline' : 'ghost'}
                                >
                                    {activeFilters.enabled ? <DropHalfIcon /> : <DropSlashIcon />}
                                </TipButton>
                            </PopoverTrigger>
                            <PopoverContent className="w-88 p-3" side="bottom" align="start">
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-muted-foreground">
                                            Filters
                                        </span>
                                        <Button
                                            size="sm"
                                            variant={activeFilters.enabled ? 'outline' : 'ghost'}
                                            onClick={() =>
                                                updateActiveLayerFilters((f) => ({
                                                    ...f,
                                                    enabled: !f.enabled
                                                }))
                                            }
                                        >
                                            {activeFilters.enabled ? 'On' : 'Off'}
                                        </Button>
                                    </div>

                                    <div className="grid grid-cols-4 gap-2">
                                        {FILTER_PRESETS.map((preset) => (
                                            <button
                                                key={preset.id}
                                                type="button"
                                                className="cursor-pointer rounded-md border border-border bg-card p-1.5 text-left text-[10px] transition-colors hover:border-primary"
                                                onClick={() =>
                                                    updateActiveLayerFilters(() => ({
                                                        ...preset.filters,
                                                        enabled: preset.id !== 'none'
                                                    }))
                                                }
                                            >
                                                <div
                                                    className="mb-1 h-7 w-full rounded bg-cover bg-center"
                                                    style={{
                                                        backgroundImage: activeLayerPreviewUrl
                                                            ? `url(${activeLayerPreviewUrl})`
                                                            : 'linear-gradient(135deg,#334155,#64748b)',
                                                        filter: toCssFilterString(preset.filters)
                                                    }}
                                                />
                                                <span className="block text-center text-muted-foreground">
                                                    {preset.label}
                                                </span>
                                            </button>
                                        ))}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            variant={activeFilters.grayscale ? 'outline' : 'ghost'}
                                            onClick={() =>
                                                updateActiveLayerFilters((f) => ({
                                                    ...f,
                                                    enabled: true,
                                                    grayscale: !f.grayscale
                                                }))
                                            }
                                        >
                                            Grayscale
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant={activeFilters.invert ? 'outline' : 'ghost'}
                                            onClick={() =>
                                                updateActiveLayerFilters((f) => ({
                                                    ...f,
                                                    enabled: true,
                                                    invert: !f.invert
                                                }))
                                            }
                                        >
                                            Invert
                                        </Button>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs text-muted-foreground">
                                            Brightness ({Math.round(activeFilters.brightness)}%)
                                        </label>
                                        <Slider
                                            value={[activeFilters.brightness]}
                                            min={0}
                                            max={200}
                                            step={1}
                                            onValueChange={(v) => {
                                                const next = Array.isArray(v) ? (v[0] ?? 100) : v;
                                                updateActiveLayerFilters((f) => ({
                                                    ...f,
                                                    enabled: true,
                                                    brightness: next
                                                }));
                                            }}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs text-muted-foreground">
                                            Contrast ({Math.round(activeFilters.contrast)}%)
                                        </label>
                                        <Slider
                                            value={[activeFilters.contrast]}
                                            min={0}
                                            max={200}
                                            step={1}
                                            onValueChange={(v) => {
                                                const next = Array.isArray(v) ? (v[0] ?? 100) : v;
                                                updateActiveLayerFilters((f) => ({
                                                    ...f,
                                                    enabled: true,
                                                    contrast: next
                                                }));
                                            }}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs text-muted-foreground">
                                            Hue ({Math.round(activeFilters.hueRotate)}deg)
                                        </label>
                                        <Slider
                                            value={[activeFilters.hueRotate]}
                                            min={-180}
                                            max={180}
                                            step={1}
                                            onValueChange={(v) => {
                                                const next = Array.isArray(v) ? (v[0] ?? 0) : v;
                                                updateActiveLayerFilters((f) => ({
                                                    ...f,
                                                    enabled: true,
                                                    hueRotate: next
                                                }));
                                            }}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs text-muted-foreground">
                                            Saturation ({Math.round(activeFilters.saturation)}%)
                                        </label>
                                        <Slider
                                            value={[activeFilters.saturation]}
                                            min={0}
                                            max={200}
                                            step={1}
                                            onValueChange={(v) => {
                                                const next = Array.isArray(v) ? (v[0] ?? 100) : v;
                                                updateActiveLayerFilters((f) => ({
                                                    ...f,
                                                    enabled: true,
                                                    saturation: next
                                                }));
                                            }}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs text-muted-foreground">
                                            Blur ({activeFilters.blur.toFixed(1)}px)
                                        </label>
                                        <Slider
                                            value={[activeFilters.blur]}
                                            min={0}
                                            max={20}
                                            step={0.5}
                                            onValueChange={(v) => {
                                                const next = Array.isArray(v) ? (v[0] ?? 0) : v;
                                                updateActiveLayerFilters((f) => ({
                                                    ...f,
                                                    enabled: true,
                                                    blur: next
                                                }));
                                            }}
                                        />
                                    </div>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </>
                )}

                {/* ── Text ── */}
                {isText && activeLayer && (
                    <>
                        <Separator orientation="vertical" className="mx-1 my-1 h-6" />
                        <TipButton
                            tip="Edit text"
                            onClick={() => startTextEditing(activeLayer.numericId)}
                        >
                            <PencilSimpleIcon />
                        </TipButton>
                    </>
                )}

                {/* ── Line ── */}
                {isDrawing || isLine || isShape ? (
                    <>
                        <Separator orientation="vertical" className="mx-1 my-1 h-6" />
                        <AppearanceToolbar />
                    </>
                ) : null}

                {/* ── Web ── */}
                {isWeb && activeLayer && (
                    <>
                        <Separator orientation="vertical" className="mx-1 my-1 h-6" />
                        <Input
                            type="url"
                            placeholder="https://example.com"
                            value={webUrl}
                            onChange={(e) => handleWebUrlChange(e.target.value)}
                            className="h-7 min-w-48 flex-1 text-xs"
                        />
                        <TipButton
                            tip={activeLayer.proxy ? 'Disable Proxy' : 'Enable Proxy'}
                            variant={activeLayer.proxy ? 'outline' : 'ghost'}
                            onClick={handleWebProxyToggle}
                        >
                            {activeLayer.proxy ? <LightningIcon /> : <LightningSlashIcon />}
                        </TipButton>
                        <TipButton
                            tip={activeLayer.url ? 'Capture screenshot' : 'Set a URL first'}
                            onClick={captureScreenshot}
                            disabled={!activeLayer.url || isCapturing}
                        >
                            {isCapturing ? (
                                <CircleNotchIcon className="animate-spin" />
                            ) : (
                                <CameraIcon />
                            )}
                        </TipButton>
                    </>
                )}

                {/* ── Video Playback ── */}
                {isVideo && activeLayer && !activeLayer.isUploading && engine && (
                    <>
                        <Separator orientation="vertical" className="mx-1 my-1 h-6" />
                        <PlaybackControls
                            key={`pc_${activeLayer.numericId}`}
                            layer={activeLayer as Extract<LayerWithEditorState, { type: 'video' }>}
                            engine={engine}
                        />
                        <Separator orientation="vertical" className="mx-1 my-1 h-6" />
                        <VideoScrubber
                            key={`vs_${activeLayer.numericId}`}
                            layer={activeLayer as Extract<LayerWithEditorState, { type: 'video' }>}
                            engine={engine}
                        />
                    </>
                )}
            </div>
            <SlidesJsonDialog open={jsonDialogOpen} onOpenChange={setJsonDialogOpen} />
        </TooltipProvider>
    );
}
