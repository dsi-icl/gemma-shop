import {
    DownloadIcon,
    EyeIcon,
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
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { AssetPreviewPortal, downloadAsset, isVideoAsset } from '~/components/AssetPreviewOverlay';
import { UploadDialog } from '~/components/UploadDialog';
import { $deleteAsset } from '~/server/projects.fns';
import { projectAssetsQueryOptions } from '~/server/projects.queries';

export const Route = createFileRoute('/_auth/quarry/projects/$projectId/assets')({
    component: AssetsTab,
    loader: ({ context, params }) => {
        context.queryClient.ensureQueryData(projectAssetsQueryOptions(params.projectId));
    }
});

type View = 'list' | 'list-preview' | 'grid';

function AssetsTab() {
    const { projectId } = Route.useParams();
    const { data: assets } = useSuspenseQuery({
        ...projectAssetsQueryOptions(projectId),
        refetchInterval: 5000
    });
    const queryClient = useQueryClient();

    const [view, setView] = useLocalStorageValue<View>('assets-view', 'list');
    const [preview, setPreview] = useState<{
        src: string;
        name: string;
        isVideo: boolean;
    } | null>(null);

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
    }) => {
        const isVideo = isVideoAsset(asset);
        setPreview({
            src: `/api/assets/${asset.url}`,
            name: asset.name,
            isVideo
        });
    };

    const handleDownload = (asset: { url: string; name: string }) => {
        downloadAsset(`/api/assets/${asset.url}`, asset.name);
    };

    const uploadTrigger = <Button variant="outline">Upload media</Button>;

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

            {assets.length === 0 && (
                <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-muted-foreground">
                    <p>No assets yet</p>
                    <UploadDialog
                        projectId={projectId}
                        trigger={
                            <button className="cursor-pointer text-xs text-primary hover:underline">
                                Upload some assets to get started
                            </button>
                        }
                        onUploadComplete={handleUploadComplete}
                    />
                </div>
            )}

            {view === 'list' && assets.length > 0 && (
                <div className="overflow-hidden rounded-2xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Size</TableHead>
                                <TableHead>Created At</TableHead>
                                <TableHead className="w-28" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {assets.map((asset) => (
                                <TableRow key={asset._id}>
                                    <TableCell className="font-medium">{asset.name}</TableCell>
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

            {view === 'list-preview' && assets.length > 0 && (
                <div className="flex flex-col gap-2">
                    {assets.map((asset) => (
                        <div
                            key={asset._id}
                            className="flex items-center gap-3 rounded-lg border p-2"
                        >
                            <img
                                src={`/api/assets/${asset.previewUrl ?? asset.url}`}
                                alt={asset.name}
                                className="h-16 w-16 cursor-pointer rounded-md object-cover"
                                onClick={() => openPreview(asset)}
                            />
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

            {view === 'grid' && assets.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                    {assets.map((asset) => (
                        <div key={asset._id} className="group relative">
                            <img
                                src={`/api/assets/${asset.previewUrl ?? asset.url}`}
                                alt={asset.name}
                                className="aspect-square w-full cursor-pointer rounded-lg object-cover"
                                onClick={() => openPreview(asset)}
                            />
                            <div className="absolute inset-0 flex items-center justify-center gap-1 rounded-lg bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                                <Button
                                    variant="secondary"
                                    size="icon-sm"
                                    onClick={() => openPreview(asset)}
                                    title="Preview"
                                >
                                    <EyeIcon />
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="icon-sm"
                                    onClick={() => handleDownload(asset)}
                                    title="Download"
                                >
                                    <DownloadIcon />
                                </Button>
                                <Button
                                    variant="destructive"
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

            <AssetPreviewPortal preview={preview} onClose={() => setPreview(null)} />
        </div>
    );
}
