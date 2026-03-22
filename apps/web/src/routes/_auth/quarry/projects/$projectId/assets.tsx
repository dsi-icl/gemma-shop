import {
    DownloadIcon,
    EyeIcon,
    FileTextIcon,
    ImageIcon,
    ListIcon,
    RowsIcon,
    SquaresFourIcon,
    TrashIcon
} from '@phosphor-icons/react';
import { Button } from '@repo/ui/components/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@repo/ui/components/table';
import { useLocalStorageValue } from '@repo/ui/hooks/use-localstorage-value';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { AssetPreviewPortal, downloadAsset, isVideoAsset } from '~/components/AssetPreviewOverlay';
import { FontPlaceholder } from '~/components/FontPlaceholder';
import { ProjectImage } from '~/components/ProjectImage';
import { UploadDialog } from '~/components/UploadDialog';
import { isFontAsset, sortAssetsFontsLast } from '~/lib/mediaUtils';
import { $deleteAsset } from '~/server/projects.fns';
import { projectAssetsQueryOptions } from '~/server/projects.queries';

export const Route = createFileRoute('/_auth/quarry/projects/$projectId/assets')({
    component: AssetsTab,
    loader: ({ context, params }) => {
        context.queryClient.ensureQueryData(projectAssetsQueryOptions(params.projectId));
    }
});

type View = 'list' | 'list-preview' | 'grid';
type KindFilter = 'media' | 'font';

function AssetsTab() {
    const { projectId } = Route.useParams();
    const { data: assets } = useSuspenseQuery({
        ...projectAssetsQueryOptions(projectId),
        refetchInterval: 5000
    });
    const queryClient = useQueryClient();

    const [view, setView] = useLocalStorageValue<View>('assets-view', 'list');
    const [kindFilter, setKindFilter] = useLocalStorageValue<KindFilter>(
        'project-assets-kind-filter',
        'media'
    );
    const [hydrated] = useState(() => typeof window !== 'undefined');
    const [preview, setPreview] = useState<{
        src: string;
        name: string;
        isVideo: boolean;
        blurhash?: string;
        sizes?: number[];
    } | null>(null);

    const displayedAssets = useMemo(() => {
        const sorted = sortAssetsFontsLast(assets as any[]);
        return sorted.filter((asset) =>
            kindFilter === 'font' ? isFontAsset(asset) : !isFontAsset(asset)
        );
    }, [assets, kindFilter]);

    const deleteAssetMutation = useMutation({
        mutationFn: $deleteAsset,
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: projectAssetsQueryOptions(projectId).queryKey
            });
            toast.success('Asset deleted');
        },
        onError: (e) => toast.error(e.message)
    });

    const handleUploadComplete = useCallback(() => {
        queryClient.invalidateQueries({
            queryKey: projectAssetsQueryOptions(projectId).queryKey
        });
    }, [projectId, queryClient]);

    const openPreview = (asset: {
        url: string;
        previewUrl?: string;
        name: string;
        mimeType?: string;
        blurhash?: string;
        sizes?: number[];
    }) => {
        if (isFontAsset(asset)) return;
        const isVideo = isVideoAsset(asset);
        setPreview({
            src: `/api/assets/${asset.url}`,
            name: asset.name,
            isVideo,
            blurhash: asset.blurhash,
            sizes: asset.sizes
        });
    };

    const handleDownload = (asset: { url: string; name: string }) => {
        downloadAsset(`/api/assets/${asset.url}`, asset.name);
    };

    const uploadTrigger = <Button variant="outline">Upload assets</Button>;

    if (!hydrated) {
        return (
            <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between">
                    <div>
                        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
                        <div className="mt-2 h-4 w-80 animate-pulse rounded bg-muted" />
                    </div>
                    <div className="h-9 w-36 animate-pulse rounded bg-muted" />
                </div>
                <div className="h-64 animate-pulse rounded-2xl border border-border bg-muted/30" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="mb-1 text-base font-medium">Project Media</h3>
                    <p className="text-sm text-muted-foreground">
                        Manage the media assets associated with this project.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 rounded-lg border p-1">
                        <Button
                            variant={kindFilter === 'media' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setKindFilter('media')}
                        >
                            <ImageIcon size={14} /> Media
                        </Button>
                        <Button
                            variant={kindFilter === 'font' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setKindFilter('font')}
                        >
                            <FileTextIcon size={14} /> Fonts
                        </Button>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg border p-1">
                        <Button
                            variant={view === 'list' ? 'secondary' : 'ghost'}
                            size="icon-sm"
                            onClick={() => setView('list')}
                        >
                            <ListIcon />
                        </Button>
                        <Button
                            variant={view === 'list-preview' ? 'secondary' : 'ghost'}
                            size="icon-sm"
                            onClick={() => setView('list-preview')}
                        >
                            <RowsIcon />
                        </Button>
                        <Button
                            variant={view === 'grid' ? 'secondary' : 'ghost'}
                            size="icon-sm"
                            onClick={() => setView('grid')}
                        >
                            <SquaresFourIcon />
                        </Button>
                    </div>
                    <UploadDialog
                        projectId={projectId}
                        trigger={uploadTrigger}
                        onUploadComplete={handleUploadComplete}
                    />
                </div>
            </div>

            {displayedAssets.length === 0 && (
                <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-muted-foreground">
                    <p>{kindFilter === 'font' ? 'No fonts yet' : 'No media assets yet'}</p>
                    <UploadDialog
                        projectId={projectId}
                        trigger={
                            <button className="cursor-pointer text-xs text-primary hover:underline">
                                Upload assets to get started
                            </button>
                        }
                        onUploadComplete={handleUploadComplete}
                    />
                </div>
            )}

            {view === 'list' && displayedAssets.length > 0 && (
                <div className="overflow-hidden rounded-2xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Size</TableHead>
                                <TableHead>Created At</TableHead>
                                <TableHead className="w-28" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {displayedAssets.map((asset) => (
                                <TableRow key={asset._id}>
                                    <TableCell className="font-medium">{asset.name}</TableCell>
                                    <TableCell>{isFontAsset(asset) ? 'font' : 'media'}</TableCell>
                                    <TableCell>{(asset.size / 1024).toFixed(2)} KB</TableCell>
                                    <TableCell>
                                        {new Date(asset.createdAt).toLocaleString()}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-0.5">
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                onClick={() => openPreview(asset)}
                                                disabled={isFontAsset(asset)}
                                                title="Preview"
                                            >
                                                <EyeIcon />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                onClick={() => handleDownload(asset)}
                                                title="Download"
                                            >
                                                <DownloadIcon />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                onClick={() =>
                                                    deleteAssetMutation.mutate({
                                                        data: { id: asset._id }
                                                    })
                                                }
                                                disabled={deleteAssetMutation.isPending}
                                                title="Delete"
                                            >
                                                <TrashIcon />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {view === 'list-preview' && displayedAssets.length > 0 && (
                <div className="flex flex-col gap-2">
                    {displayedAssets.map((asset) => (
                        <div
                            key={asset._id}
                            className="flex items-center gap-3 rounded-lg border p-2"
                        >
                            {isFontAsset(asset) ? (
                                <FontPlaceholder name={asset.name} className="h-16 w-16" />
                            ) : (
                                <div className="group relative h-16 w-16 overflow-hidden rounded-md">
                                    <ProjectImage
                                        src={asset.previewUrl ?? asset.url}
                                        blurhash={asset.blurhash}
                                        sizes={asset.sizes}
                                        alt={asset.name}
                                        className="h-16 w-16 rounded-md"
                                        imgClassName="cursor-pointer object-cover"
                                        onClick={() => openPreview(asset)}
                                    />
                                    <div className="absolute top-0.5 right-0.5 z-20 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openPreview(asset);
                                            }}
                                            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded bg-black/60 text-white hover:bg-black/80"
                                            title="Preview"
                                        >
                                            <EyeIcon size={12} />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDownload(asset);
                                            }}
                                            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded bg-black/60 text-white hover:bg-black/80"
                                            title="Download"
                                        >
                                            <DownloadIcon size={12} />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                deleteAssetMutation.mutate({
                                                    data: { id: asset._id }
                                                });
                                            }}
                                            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded bg-black/60 text-white hover:bg-destructive"
                                            title="Delete"
                                        >
                                            <TrashIcon size={12} />
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="flex-1">
                                <div className="font-medium">{asset.name}</div>
                                <div className="text-xs text-muted-foreground">
                                    {(asset.size / 1024).toFixed(2)} KB
                                </div>
                            </div>
                            <div className="flex items-center gap-0.5">
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => openPreview(asset)}
                                    disabled={isFontAsset(asset)}
                                    title="Preview"
                                >
                                    <EyeIcon />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => handleDownload(asset)}
                                    title="Download"
                                >
                                    <DownloadIcon />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() =>
                                        deleteAssetMutation.mutate({ data: { id: asset._id } })
                                    }
                                    disabled={deleteAssetMutation.isPending}
                                    title="Delete"
                                >
                                    <TrashIcon />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {view === 'grid' && displayedAssets.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                    {displayedAssets.map((asset) => (
                        <div key={asset._id} className="group relative">
                            {isFontAsset(asset) ? (
                                <FontPlaceholder
                                    name={asset.name}
                                    className="aspect-square w-full"
                                />
                            ) : (
                                <ProjectImage
                                    src={asset.previewUrl ?? asset.url}
                                    blurhash={asset.blurhash}
                                    sizes={asset.sizes}
                                    alt={asset.name}
                                    className="--check-size=5px aspect-square w-full rounded-lg"
                                    imgClassName="cursor-pointer object-cover"
                                    onClick={() => openPreview(asset)}
                                />
                            )}
                            {!isFontAsset(asset) ? (
                                <>
                                    <div className="absolute inset-x-0 bottom-0 z-20 bg-linear-to-t from-black/60 to-transparent px-1 pt-3 pb-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                        <span className="block truncate text-[10px] text-white">
                                            {asset.name}
                                        </span>
                                    </div>
                                    <div className="absolute top-0.5 right-0.5 z-20 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openPreview(asset);
                                            }}
                                            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded bg-black/60 text-white hover:bg-black/80"
                                            title="Preview"
                                        >
                                            <EyeIcon size={12} />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDownload(asset);
                                            }}
                                            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded bg-black/60 text-white hover:bg-black/80"
                                            title="Download"
                                        >
                                            <DownloadIcon size={12} />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                deleteAssetMutation.mutate({
                                                    data: { id: asset._id }
                                                });
                                            }}
                                            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded bg-black/60 text-white hover:bg-destructive"
                                            title="Delete"
                                        >
                                            <TrashIcon size={12} />
                                        </button>
                                    </div>
                                </>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}

            <AssetPreviewPortal preview={preview} onClose={() => setPreview(null)} />
        </div>
    );
}
