import { CaretDownIcon, ImageIcon, SpinnerGapIcon, UploadSimpleIcon } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import { encode } from 'blurhash';
import { i } from 'motion/react-client';
import { useCallback, useRef, useState } from 'react';
import { Blurhash } from 'react-blurhash';
import { toast } from 'sonner';

import { EditorEngine } from '~/lib/editorEngine';
import { useEditorStore } from '~/lib/editorStore';
import type { Layer, LayerWithEditorState } from '~/lib/types';
import { projectAssetsQueryOptions } from '~/server/projects.queries';

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
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const uploadFiles = useCallback(
        async (files: File[]) => {
            if (files.length === 0) return;
            setUploading(true);

            const uppy = new Uppy({
                restrictions: { allowedFileTypes: ['image/*', 'video/*'] }
            }).use(Tus, {
                endpoint: '/api/uploads/',
                chunkSize: 5 * 1024 * 1024
            });

            uppy.on('error', (error) => {
                toast.error(error.message);
                setUploading(false);
            });

            try {
                for (const file of files) {
                    uppy.addFile({
                        name: file.name,
                        type: file.type,
                        data: file,
                        meta: { projectId }
                    });
                }
            } catch (e: any) {
                toast.error(e.message);
                setUploading(false);
                uppy.destroy();
                return;
            }

            uppy.on('complete', () => {
                // Server creates asset records in onUploadFinish — refresh the list
                queryClient.invalidateQueries({
                    queryKey: projectAssetsQueryOptions(projectId).queryKey
                });
            });

            try {
                await uppy.upload();
                toast.success(`Uploaded ${files.length} file(s)`);
            } catch {
                // errors handled by uppy events
            } finally {
                setUploading(false);
                uppy.destroy();
            }
        },
        [projectId, queryClient]
    );

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            const files = Array.from(e.dataTransfer.files).filter(
                (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
            );
            uploadFiles(files);
        },
        [uploadFiles]
    );

    const handleFileInput = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            if (e.target.files?.length) {
                uploadFiles(Array.from(e.target.files));
                e.target.value = '';
            }
        },
        [uploadFiles]
    );

    const addAssetAsLayer = useCallback(
        async (asset: { name: string; url: string; mimeType?: string; blurhash?: string }) => {
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
            let vid: HTMLVideoElement | undefined;
            let img: HTMLImageElement | undefined;
            // let blurhash = '';

            if (isVideo) {
                try {
                    vid = document.createElement('video');
                    vid.muted = true;
                    vid.playsInline = true;
                    vid.crossOrigin = 'anonymous';
                    vid.src = asset.url;
                    await new Promise<void>((resolve, reject) => {
                        if (!vid) return;
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
                    img = new window.Image();
                    img.crossOrigin = 'anonymous';
                    img.src = asset.url;
                    await new Promise<void>((resolve) => {
                        if (!img) return;
                        img.onload = () => resolve();
                        img.onerror = () => resolve();
                    });
                    mediaWidth = img.naturalWidth || mediaWidth;
                    mediaHeight = img.naturalHeight || mediaHeight;
                } catch {
                    // use defaults
                }
            }

            // const canvas = document.createElement('canvas');
            // const maxWidth = 100;
            // const scale = maxWidth / mediaWidth;
            // const width = maxWidth;
            // const height = Math.floor(mediaHeight * scale);
            // canvas.width = width;
            // canvas.height = height;
            // const ctx = canvas.getContext('2d');

            const config: Layer['config'] = {
                cx: mediaWidth / 2,
                cy: mediaHeight / 2,
                width: mediaWidth,
                height: mediaHeight,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                zIndex
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
                progress: 100,
                ...(isVideo ? {} : {})
            };

            let layer:
                | Extract<LayerWithEditorState, { type: 'image' }>
                | Extract<LayerWithEditorState, { type: 'video' }>;
            if (isVideo) {
                // if (ctx && vid) {
                //     ctx?.drawImage(vid, 0, 0, width, height);
                //     const imageData = ctx.getImageData(0, 0, width, height);
                //     blurhash = encode(imageData.data, imageData.width, imageData.height, 4, 4);
                // }
                layer = {
                    type: 'video',
                    playback: defaultPlayback,
                    rvfcActive: false,
                    duration,
                    loop: true,
                    blurhash: asset.blurhash ?? '',
                    ...layerBase
                };
            } else {
                // if (ctx && img) {
                //     ctx?.drawImage(img, 0, 0, width, height);
                //     const imageData = ctx.getImageData(0, 0, width, height);
                //     blurhash = encode(imageData.data, imageData.width, imageData.height, 4, 4);
                // }
                layer = {
                    type: 'image',
                    blurhash: asset.blurhash ?? '',
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
                <div className="flex items-center gap-2">
                    {uploading && (
                        <SpinnerGapIcon
                            size={14}
                            weight="bold"
                            className="animate-spin text-muted-foreground"
                        />
                    )}
                    <CaretDownIcon
                        size={14}
                        weight="bold"
                        className={`text-muted-foreground transition-transform ${collapsed ? '' : 'rotate-180'}`}
                    />
                </div>
            </button>

            {!collapsed && (
                <div
                    className={`flex flex-1 flex-col overflow-y-auto p-2 transition-colors ${dragOver ? 'bg-primary/10' : ''}`}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={handleFileInput}
                    />

                    {assets.length === 0 && !uploading && (
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                        >
                            <UploadSimpleIcon size={24} />
                            <span className="text-xs">Drop files or click to upload</span>
                        </button>
                    )}

                    {assets.length > 0 && (
                        <>
                            <div className="grid grid-cols-3 gap-1.5">
                                {assets.map((asset) => {
                                    const isVideo =
                                        asset.mimeType?.startsWith('video/') ||
                                        /\.(mp4|mov|webm|avi|mkv)$/i.test(asset.name);
                                    const thumbIdentifier = isVideo ? asset.previewUrl : asset.url;
                                    const thumbSrc = thumbIdentifier
                                        ? `/api/assets/${thumbIdentifier}`
                                        : undefined;

                                    return (
                                        <button
                                            key={asset._id}
                                            onClick={() =>
                                                addAssetAsLayer({
                                                    ...asset,
                                                    url: asset.url ? `/api/assets/${asset.url}` : ''
                                                })
                                            }
                                            className="group relative cursor-pointer overflow-hidden rounded-md border border-border bg-background transition-colors hover:border-primary"
                                            title={asset.name}
                                        >
                                            {asset.blurhash && !thumbSrc && (
                                                <Blurhash
                                                    hash={asset.blurhash}
                                                    width="100%"
                                                    height="100%"
                                                    className="aspect-square"
                                                />
                                            )}
                                            {thumbSrc ? (
                                                <img
                                                    src={thumbSrc}
                                                    alt={asset.name}
                                                    className="aspect-square w-full object-cover"
                                                    loading="lazy"
                                                    style={
                                                        asset.blurhash
                                                            ? {
                                                                  backgroundImage: 'none'
                                                              }
                                                            : undefined
                                                    }
                                                />
                                            ) : !asset.blurhash ? (
                                                <div className="flex aspect-square items-center justify-center bg-muted">
                                                    <ImageIcon
                                                        size={24}
                                                        className="text-muted-foreground"
                                                    />
                                                </div>
                                            ) : null}
                                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1 pt-3 pb-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                                <span className="block truncate text-[10px] text-white">
                                                    {asset.name}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="mt-2 flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                            >
                                <UploadSimpleIcon size={14} />
                                {uploading ? 'Uploading...' : 'Upload'}
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
