import { ListIcon, RowsIcon, SquaresFourIcon, TrashIcon } from '@phosphor-icons/react';
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
import { useCallback } from 'react';
import { toast } from 'sonner';

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
                                src={`/api/assets/${asset.previewUrl ?? asset.url}`}
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
                                src={`/api/assets/${asset.previewUrl ?? asset.url}`}
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
