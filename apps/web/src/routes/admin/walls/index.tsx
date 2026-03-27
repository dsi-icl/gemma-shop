import { MonitorIcon } from '@phosphor-icons/react';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Suspense } from 'react';
import { toast } from 'sonner';

import { useEditorStore } from '~/lib/editorStore';
import { $adminCreateWall, $adminUnbindWall } from '~/server/admin.fns';
import { adminWallBindingMetaQueryOptions, adminWallsQueryOptions } from '~/server/admin.queries';

export const Route = createFileRoute('/admin/walls/')({
    component: AdminWalls,
    loader: ({ context }) => {
        context.queryClient.ensureQueryData(adminWallsQueryOptions());
    }
});

function AdminWalls() {
    const { data: walls = [] } = useSuspenseQuery(adminWallsQueryOptions());
    const liveNodeCounts = useEditorStore((s) => s.wallNodeCounts);
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const createWallMutation = useMutation({
        mutationFn: async (wallId: string) =>
            $adminCreateWall({
                data: {
                    wallId,
                    name: null
                }
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: adminWallsQueryOptions().queryKey });
            toast.success('Wall created');
        },
        onError: (e: any) => toast.error(e.message ?? 'Failed to create wall')
    });

    const form = useForm({
        defaultValues: { wallId: '' },
        onSubmit: async ({ value }) => {
            const wallId = value.wallId.trim();
            if (!wallId) return;
            await createWallMutation.mutateAsync(wallId);
            form.setFieldValue('wallId', '');
        }
    });

    const unbindMutation = useMutation({
        mutationFn: async (wallId: string) => $adminUnbindWall({ data: { wallId } }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: adminWallsQueryOptions().queryKey });
            toast.success('Wall unbound');
        },
        onError: (e: any) => toast.error(e.message ?? 'Failed to unbind wall')
    });

    return (
        <div className="space-y-6">
            <div>
                <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                    <form.Field name="wallId">
                        {(field) => (
                            <div className="space-y-1">
                                <Label htmlFor={field.name}>Wall Slug</Label>
                                <Input
                                    id={field.name}
                                    placeholder="Wall Slug"
                                    value={field.state.value}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                />
                            </div>
                        )}
                    </form.Field>
                    <Button
                        disabled={
                            createWallMutation.isPending ||
                            form.getFieldValue('wallId').trim().length === 0
                        }
                        onClick={() => form.handleSubmit()}
                    >
                        Add Wall
                    </Button>
                </div>
            </div>
            {walls.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    No walls registered
                </div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium">ID</th>
                                <th className="px-4 py-3 text-left font-medium">Slug</th>
                                <th className="px-4 py-3 text-left font-medium">Name</th>
                                <th className="px-4 py-3 text-left font-medium">Connected Nodes</th>
                                <th className="px-4 py-3 text-left font-medium">Bound Project</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {walls.map((wall: any) => {
                                const connectedNodes =
                                    liveNodeCounts[wall.wallId] ?? wall.connectedNodes;
                                return (
                                    <tr
                                        key={wall._id}
                                        className="cursor-pointer hover:bg-muted/30"
                                        onClick={() =>
                                            navigate({
                                                to: '/admin/walls/$wallId',
                                                params: { wallId: wall._id }
                                            })
                                        }
                                    >
                                        <td className="px-4 py-3 font-mono text-xs">
                                            <Link
                                                to="/admin/walls/$wallId"
                                                params={{ wallId: wall._id }}
                                                className="underline-offset-2 hover:underline"
                                            >
                                                {wall._id}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs">
                                            {wall.wallId}
                                        </td>
                                        <td className="px-4 py-3">{wall.name ?? '—'}</td>
                                        <td className="px-4 py-3">
                                            <span className="flex items-center gap-1.5">
                                                <MonitorIcon
                                                    size={14}
                                                    weight={connectedNodes > 0 ? 'fill' : 'regular'}
                                                    className={
                                                        connectedNodes > 0
                                                            ? 'text-green-500'
                                                            : 'text-muted-foreground'
                                                    }
                                                />
                                                {connectedNodes}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                            <div className="flex items-center justify-between gap-2">
                                                {wall.boundProjectId ? (
                                                    <Suspense
                                                        fallback={
                                                            <div className="space-y-1">
                                                                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                                                                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                                                            </div>
                                                        }
                                                    >
                                                        <WallBindingCell wall={wall} />
                                                    </Suspense>
                                                ) : (
                                                    <span>—</span>
                                                )}
                                                {wall.boundProjectId && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={unbindMutation.isPending}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            unbindMutation.mutate(wall.wallId);
                                                        }}
                                                    >
                                                        Unbind
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function WallBindingCell({
    wall
}: {
    wall: {
        boundProjectId?: string | null;
        boundCommitId?: string | null;
        boundSlideId?: string | null;
    };
}) {
    const { data } = useSuspenseQuery(
        adminWallBindingMetaQueryOptions({
            boundProjectId: wall.boundProjectId!,
            boundCommitId: wall.boundCommitId,
            boundSlideId: wall.boundSlideId
        })
    );

    return (
        <div className="flex flex-col">
            <span className="font-medium text-foreground">
                {data.projectName ?? wall.boundProjectId}
            </span>
            <span>
                {data.slideName
                    ? `Slide: ${data.slideName}`
                    : wall.boundSlideId
                      ? `Slide ID: ${wall.boundSlideId}`
                      : 'Slide: —'}
            </span>
        </div>
    );
}
