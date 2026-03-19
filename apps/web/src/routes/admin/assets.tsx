import { TrashIcon, UploadSimpleIcon } from '@phosphor-icons/react';
import { Button } from '@repo/ui/components/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogTitle
} from '@repo/ui/components/dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';

import { ProjectImage } from '~/components/ProjectImage';
import { UploadDialog } from '~/components/UploadDialog';
import { PUBLIC_ASSET_PROJECT_ID } from '~/lib/serverVariables';
import { $adminDeletePublicAsset } from '~/server/admin.fns';
import { adminPublicAssetsQueryOptions } from '~/server/admin.queries';

export const Route = createFileRoute('/admin/assets')({
    component: AdminAssets
});

function AdminAssets() {
    const { data: assets = [], isLoading } = useQuery(adminPublicAssetsQueryOptions());
    const queryClient = useQueryClient();
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

    const deleteMutation = useMutation({
        mutationFn: (id: string) => $adminDeletePublicAsset({ data: { id } }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'public-assets'] });
            toast.success('Asset deleted');
            setDeleteTarget(null);
        },
        onError: (e: any) => toast.error(e.message)
    });

    const uploadTrigger = (
        <button className="group relative flex aspect-square w-full max-w-25 cursor-pointer flex-col justify-center overflow-hidden rounded-md border border-border bg-background text-center align-middle transition-colors hover:border-primary">
            <UploadSimpleIcon size={16} className="w-full" />
            <span className="text-xs">Upload</span>
        </button>
    );

    return (
        <div>
            <h1 className="mb-1 text-xl font-semibold">Public Assets</h1>
            <p className="mb-4 text-sm text-muted-foreground">
                Assets uploaded here are visible in every project's media library.
            </p>
            <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))' }}
            >
                <UploadDialog
                    projectId={PUBLIC_ASSET_PROJECT_ID}
                    trigger={uploadTrigger}
                    onUploadComplete={() =>
                        queryClient.invalidateQueries({ queryKey: ['admin', 'public-assets'] })
                    }
                />

                {assets.map((asset: any) => {
                    const isVideo =
                        asset.mimeType?.startsWith('video/') ||
                        /\.(mp4|mov|webm|avi|mkv)$/i.test(asset.name);
                    const thumb = isVideo ? (asset.previewUrl ?? asset.url) : asset.url;
                    return (
                        <div
                            key={asset._id}
                            className="group relative max-w-25 overflow-hidden rounded-md border border-border bg-background"
                            title={asset.name}
                        >
                            {thumb ? (
                                <ProjectImage
                                    src={thumb}
                                    blurhash={asset.blurhash}
                                    sizes={asset.sizes}
                                    alt={asset.name}
                                    className="aspect-square w-full"
                                    imgClassName="object-cover"
                                />
                            ) : (
                                <div className="flex aspect-square items-center justify-center bg-muted text-xs text-muted-foreground">
                                    {asset.name}
                                </div>
                            )}
                            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent px-1 pt-3 pb-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <span className="block truncate text-[10px] text-white">
                                    {asset.name}
                                </span>
                            </div>
                            <button
                                onClick={() => setDeleteTarget({ id: asset._id, name: asset.name })}
                                className="absolute top-0.5 right-0.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive"
                                title="Delete"
                            >
                                <TrashIcon size={12} />
                            </button>
                        </div>
                    );
                })}
            </div>
            {isLoading && <div className="mt-4 text-sm text-muted-foreground">Loading...</div>}
            <Dialog
                open={deleteTarget !== null}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null);
                }}
            >
                <DialogContent className="w-80 p-5">
                    <DialogTitle>Delete public asset</DialogTitle>
                    <DialogDescription className="mt-1">
                        Delete <strong>{deleteTarget?.name}</strong>? This will remove it from all
                        projects' libraries.
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
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                        >
                            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
