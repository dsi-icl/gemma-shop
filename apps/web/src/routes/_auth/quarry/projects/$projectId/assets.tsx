import { ListIcon, RowsIcon, SquaresFourIcon, TrashIcon, UploadIcon } from '@phosphor-icons/react';
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
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

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
    const { data: assets } = useSuspenseQuery(projectAssetsQueryOptions(projectId));
    const queryClient = useQueryClient();
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [view, setView] = useLocalStorageValue<View>('assets-view', 'list');

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

    const handleUpload = useCallback(
        async (files: FileList) => {
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
                for (const file of Array.from(files)) {
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

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="mb-1 text-base font-medium">Project Assets</h3>
                    <p className="text-sm text-muted-foreground">
                        Manage the assets associated with this project.
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
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                            if (e.target.files?.length) {
                                handleUpload(e.target.files);
                            }
                        }}
                    />
                    <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                    >
                        <UploadIcon />
                        {uploading ? 'Uploading...' : 'Upload assets'}
                    </Button>
                </div>
            </div>

            {assets.length === 0 && (
                <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-muted-foreground">
                    <p>No assets yet</p>
                    <p className="text-xs">Upload some assets to get started.</p>
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
                                <TableHead className="w-12" />
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
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={() =>
                                                deleteAssetMutation.mutate({
                                                    data: { id: asset._id }
                                                })
                                            }
                                            disabled={deleteAssetMutation.isPending}
                                        >
                                            <TrashIcon />
                                        </Button>
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
                                src={asset.previewUrl ?? asset.url}
                                alt={asset.name}
                                className="h-16 w-16 rounded-md object-cover"
                            />
                            <div className="flex-1">
                                <div className="font-medium">{asset.name}</div>
                                <div className="text-xs text-muted-foreground">
                                    {(asset.size / 1024).toFixed(2)} KB
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() =>
                                    deleteAssetMutation.mutate({ data: { id: asset._id } })
                                }
                                disabled={deleteAssetMutation.isPending}
                            >
                                <TrashIcon />
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            {view === 'grid' && assets.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                    {assets.map((asset) => (
                        <div key={asset._id} className="group relative">
                            <img
                                src={asset.previewUrl ?? asset.url}
                                alt={asset.name}
                                className="aspect-square w-full rounded-lg object-cover"
                            />
                            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                                <Button
                                    variant="destructive"
                                    size="icon-sm"
                                    onClick={() =>
                                        deleteAssetMutation.mutate({ data: { id: asset._id } })
                                    }
                                    disabled={deleteAssetMutation.isPending}
                                >
                                    <TrashIcon />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
