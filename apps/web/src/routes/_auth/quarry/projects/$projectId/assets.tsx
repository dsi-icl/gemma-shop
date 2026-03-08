import { TrashIcon, UploadIcon } from '@phosphor-icons/react';
import { Button } from '@repo/ui/components/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@repo/ui/components/table';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { $createAsset, $deleteAsset } from '~/server/projects.fns';
import { projectAssetsQueryOptions } from '~/server/projects.queries';

export const Route = createFileRoute('/_auth/quarry/projects/$projectId/assets')({
    component: AssetsTab,
    loader: ({ context, params }) => {
        context.queryClient.ensureQueryData(projectAssetsQueryOptions(params.projectId));
    }
});

function AssetsTab() {
    const { projectId } = Route.useParams();
    const { data: assets } = useSuspenseQuery(projectAssetsQueryOptions(projectId));
    const queryClient = useQueryClient();
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const createAssetMutation = useMutation({
        mutationFn: $createAsset,
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: projectAssetsQueryOptions(projectId).queryKey
            });
            toast.success('Asset created');
        },
        onError: (e) => toast.error(e.message)
    });

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
            const uppy = new Uppy({ restrictions: { allowedFileTypes: ['image/*'] } }).use(Tus, {
                endpoint: '/api/uploads/',
                chunkSize: 5 * 1024 * 1024
            });

            for (const file of Array.from(files)) {
                uppy.addFile({ name: file.name, type: file.type, data: file });
            }

            uppy.on('upload-success', (file, response) => {
                if (response.uploadURL && file && file.size) {
                    createAssetMutation.mutate({
                        data: {
                            projectId,
                            name: file.name,
                            url: response.uploadURL,
                            size: file.size
                        }
                    });
                }
            });

            try {
                await uppy.upload();
            } catch {
                // errors handled by uppy events
            } finally {
                setUploading(false);
                uppy.destroy();
            }
        },
        [projectId, createAssetMutation]
    );

    return (
        <div className="flex flex-col gap-4">
            <div>
                <h3 className="mb-1 text-base font-medium">Project Assets</h3>
                <p className="text-sm text-muted-foreground">
                    Manage the assets associated with this project.
                </p>
            </div>

            <div className="flex justify-end">
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
                                <TableCell>{new Date(asset.createdAt).toLocaleString()}</TableCell>
                                <TableCell>
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
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
