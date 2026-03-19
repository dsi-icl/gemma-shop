import {
    CaretDownIcon,
    DownloadIcon,
    EyeIcon,
    ImageIcon,
    TrashIcon,
    UploadSimpleIcon
} from '@phosphor-icons/react';
import { Button } from '@repo/ui/components/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogTitle
} from '@repo/ui/components/dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { EditorEngine } from '~/lib/editorEngine';
import { useEditorStore } from '~/lib/editorStore';
import type { Layer, LayerWithEditorState } from '~/lib/types';
import { $deleteAsset } from '~/server/projects.fns';
import { projectAssetsQueryOptions } from '~/server/projects.queries';

import { AssetPreviewPortal, downloadAsset, isVideoAsset } from './AssetPreviewOverlay';
import { ProjectImage } from './ProjectImage';
import { UploadDialog } from './UploadDialog';

interface AssetLibraryProps {
    projectId: string;
    titleBarSize?: number;
    collapsed?: boolean;
    onCollapse?: () => void;
    onExpand?: () => void;
}

export function AssetLibrary({
    projectId,
    titleBarSize = 40,
    collapsed,
    onCollapse,
    onExpand
}: AssetLibraryProps) {
    const { data: assets = [] } = useQuery(projectAssetsQueryOptions(projectId));
    const queryClient = useQueryClient();
    const [deleteTarget, setDeleteTarget] = useState<{
        id: string;
        name: string;
        inUse: boolean;
    } | null>(null);
    const [preview, setPreview] = useState<{
        src: string;
        name: string;
        isVideo: boolean;
        blurhash?: string;
        sizes?: number[];
    } | null>(null);

    const deleteAssetMutation = useMutation({
        mutationFn: $deleteAsset,
        onSuccess: () => {
            // Remove any layers using this asset's URL
            if (deleteTarget) {
                const store = useEditorStore.getState();
                const matchingAsset = assets.find((a) => a._id === deleteTarget.id);
                if (matchingAsset) {
                    const assetUrl = matchingAsset.url;
                    const prefixedUrl = `/api/assets/${assetUrl}`;
                    for (const layer of [...store.layers]) {
                        if (
                            (layer.type === 'image' || layer.type === 'video') &&
                            (layer.url === assetUrl || layer.url === prefixedUrl)
                        ) {
                            // removeLayer updates state + sends delete_layer to bus
                            store.removeLayer(layer.numericId);
                        }
                    }
                }
            }
            queryClient.invalidateQueries({
                queryKey: projectAssetsQueryOptions(projectId).queryKey
            });
            toast.success('Asset deleted');
            setDeleteTarget(null);
        },
        onError: (e) => toast.error(e.message)
    });

    const handleDeleteClick = useCallback((asset: { _id: string; name: string; url: string }) => {
        const { layers } = useEditorStore.getState();
        const inUse = layers.some(
            (l) =>
                (l.type === 'image' || l.type === 'video') &&
                (l.url === asset.url || l.url === `/api/assets/${asset.url}`)
        );
        setDeleteTarget({ id: asset._id, name: asset.name, inUse });
    }, []);

    const handleUploadComplete = useCallback(() => {
        queryClient.invalidateQueries({
            queryKey: projectAssetsQueryOptions(projectId).queryKey
        });
    }, [projectId, queryClient]);

    const addAssetAsLayer = useCallback(
        async (asset: {
            name: string;
            url: string;
            mimeType?: string;
            blurhash?: string;
            sizes?: number[];
        }) => {
            const isVideo =
                asset.mimeType?.startsWith('video/') ||
                /\.(mp4|mov|webm|avi|mkv)$/i.test(asset.name) ||
                /\.(mp4|mov|webm|avi|mkv)$/i.test(asset.url);

            const store = useEditorStore.getState();
            const engine = EditorEngine.getInstance();
            const numericId = store.allocateId();
            const zIndex = store.allocateZIndex();

            let mediaWidth = 800;
            let mediaHeight = 600;
            let duration = 0;

            if (isVideo) {
                try {
                    const vid = document.createElement('video');
                    vid.muted = true;
                    vid.playsInline = true;
                    vid.crossOrigin = 'anonymous';
                    vid.src = asset.url;
                    await new Promise<void>((resolve, reject) => {
                        vid.onloadeddata = () => resolve();
                        vid.onerror = () => reject(new Error('Failed to load video'));
                    });
                    mediaWidth = vid.videoWidth || mediaWidth;
                    mediaHeight = vid.videoHeight || mediaHeight;
                    duration = vid.duration || 0;
                    vid.removeAttribute('src');
                    vid.load();
                } catch {
                    // use defaults
                }
            } else {
                try {
                    const img = new window.Image();
                    img.crossOrigin = 'anonymous';
                    img.src = asset.url;
                    await new Promise<void>((resolve) => {
                        img.onload = () => resolve();
                        img.onerror = () => resolve();
                    });
                    mediaWidth = img.naturalWidth || mediaWidth;
                    mediaHeight = img.naturalHeight || mediaHeight;
                } catch {
                    // use defaults
                }
            }

            const config: Layer['config'] = {
                cx: mediaWidth / 2,
                cy: mediaHeight / 2,
                width: mediaWidth,
                height: mediaHeight,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                zIndex,
                visible: true
            };

            const defaultPlayback: Extract<Layer, { type: 'video' }>['playback'] = {
                status: 'paused',
                anchorMediaTime: 0,
                anchorServerTime: engine.getServerTime()
            };

            const layerBase = {
                numericId,
                url: asset.url,
                config,
                isUploading: false,
                progress: 100
            };

            let layer:
                | Extract<LayerWithEditorState, { type: 'image' }>
                | Extract<LayerWithEditorState, { type: 'video' }>;
            if (isVideo) {
                layer = {
                    type: 'video',
                    playback: defaultPlayback,
                    rvfcActive: false,
                    duration,
                    loop: true,
                    blurhash: asset.blurhash ?? '',
                    sizes: asset.sizes,
                    ...layerBase
                };
            } else {
                layer = {
                    type: 'image',
                    blurhash: asset.blurhash ?? '',
                    sizes: asset.sizes,
                    ...layerBase
                };
            }

            store.upsertLayer(layer);
            store.toggleLayerSelection(numericId.toString(), false, false);

            engine.sendJSON({
                type: 'upsert_layer',
                origin: 'assetLibrary',
                layer
            });
            store.markDirty();
        },
        []
    );

    const toggleCollapse = () => {
        if (collapsed) onExpand?.();
        else onCollapse?.();
    };

    const uploadTrigger = (
        <button className="group relative flex aspect-square w-full max-w-25 cursor-pointer flex-col justify-center overflow-hidden rounded-md border border-border bg-background text-center align-middle transition-colors hover:border-primary">
            <UploadSimpleIcon size={16} className="w-full" />
            <span className="text-xs">Upload</span>
        </button>
    );

    const emptyTrigger = (
        <button className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-muted-foreground transition-colors hover:border-primary hover:text-primary">
            <UploadSimpleIcon size={24} />
            <span className="text-xs">Drop files or click to upload</span>
        </button>
    );

    return (
        <div className="flex h-full flex-col overflow-hidden bg-muted/30">
            <button
                onClick={toggleCollapse}
                className="flex shrink-0 cursor-pointer items-center justify-between border-b border-border bg-muted/50 px-4"
                style={{ height: titleBarSize }}
            >
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <ImageIcon size={18} weight="bold" /> Media
                </h2>
                <CaretDownIcon
                    size={14}
                    weight="bold"
                    className={`text-muted-foreground transition-transform ${collapsed ? '' : 'rotate-180'}`}
                />
            </button>

            {!collapsed && (
                <div className="flex flex-1 flex-col overflow-y-auto p-2">
                    {assets.length === 0 && (
                        <UploadDialog
                            projectId={projectId}
                            trigger={emptyTrigger}
                            onUploadComplete={handleUploadComplete}
                        />
                    )}

                    {assets.length > 0 && (
                        <>
                            <div
                                className="grid gap-1.5"
                                style={{
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))'
                                }}
                            >
                                <UploadDialog
                                    key={'upload-dialog'}
                                    projectId={projectId}
                                    trigger={uploadTrigger}
                                    onUploadComplete={handleUploadComplete}
                                />
                                {assets.map((asset) => {
                                    const isVideo =
                                        asset.mimeType?.startsWith('video/') ||
                                        /\.(mp4|mov|webm|avi|mkv)$/i.test(asset.name);
                                    const thumbIdentifier = isVideo
                                        ? (asset.previewUrl ?? asset.url)
                                        : asset.url;

                                    return (
                                        <button
                                            key={asset._id}
                                            onClick={() =>
                                                addAssetAsLayer({
                                                    ...asset,
                                                    url: asset.url ? `/api/assets/${asset.url}` : ''
                                                })
                                            }
                                            className="bg-checkerboard group relative max-w-25 cursor-pointer overflow-hidden rounded-md border border-border bg-background transition-colors hover:border-primary"
                                            title={asset.name}
                                        >
                                            {thumbIdentifier ? (
                                                <ProjectImage
                                                    src={thumbIdentifier}
                                                    blurhash={asset.blurhash}
                                                    sizes={asset.sizes}
                                                    alt={asset.name}
                                                    className="aspect-square w-full [--checker-size:10px]"
                                                    imgClassName="object-cover"
                                                />
                                            ) : (
                                                <div className="flex aspect-square items-center justify-center bg-muted">
                                                    <ImageIcon
                                                        size={24}
                                                        className="text-muted-foreground"
                                                    />
                                                </div>
                                            )}
                                            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent px-1 pt-3 pb-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                                <span className="block truncate text-[10px] text-white">
                                                    {asset.name}
                                                </span>
                                            </div>
                                            <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setPreview({
                                                            src: `/api/assets/${asset.url}`,
                                                            name: asset.name,
                                                            isVideo: isVideoAsset(asset),
                                                            blurhash: asset.blurhash,
                                                            sizes: asset.sizes
                                                        });
                                                    }}
                                                    className="flex h-5 w-5 cursor-pointer items-center justify-center rounded bg-black/60 text-white hover:bg-black/80"
                                                    title="Preview"
                                                >
                                                    <EyeIcon size={12} />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        downloadAsset(
                                                            `/api/assets/${asset.url}`,
                                                            asset.name
                                                        );
                                                    }}
                                                    className="flex h-5 w-5 cursor-pointer items-center justify-center rounded bg-black/60 text-white hover:bg-black/80"
                                                    title="Download"
                                                >
                                                    <DownloadIcon size={12} />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteClick(asset);
                                                    }}
                                                    className="flex h-5 w-5 cursor-pointer items-center justify-center rounded bg-black/60 text-white hover:bg-destructive"
                                                    title="Delete asset"
                                                >
                                                    <TrashIcon size={12} />
                                                </button>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}

            <AssetPreviewPortal preview={preview} onClose={() => setPreview(null)} />

            <Dialog
                open={deleteTarget !== null}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null);
                }}
            >
                <DialogContent className="w-80 p-5">
                    <DialogTitle>Delete asset</DialogTitle>
                    <DialogDescription className="mt-1">
                        {deleteTarget?.inUse ? (
                            <>
                                <strong>{deleteTarget.name}</strong> is currently used in a layer on
                                this slide. The layer will be removed. Are you sure?
                            </>
                        ) : (
                            <>
                                Are you sure you want to delete{' '}
                                <strong>{deleteTarget?.name}</strong>?
                            </>
                        )}
                    </DialogDescription>
                    <div className="mt-4 flex justify-end gap-2">
                        <DialogClose>
                            <Button variant="outline" size="sm">
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button
                            variant="destructive"
                            size="sm"
                            disabled={deleteAssetMutation.isPending}
                            onClick={() => {
                                if (deleteTarget) {
                                    deleteAssetMutation.mutate({
                                        data: { id: deleteTarget.id }
                                    });
                                }
                            }}
                        >
                            {deleteAssetMutation.isPending ? 'Deleting...' : 'Delete'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
