import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { toast } from 'sonner';

import { $adminDeleteWall, $adminUpdateWallMetadata } from '~/server/admin.fns';
import { adminWallQueryOptions } from '~/server/admin.queries';

export const Route = createFileRoute('/admin/walls/$wallId/')({
    component: WallInfoTab
});

function WallInfoTab() {
    const { wallId } = Route.useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { data: wall } = useSuspenseQuery(adminWallQueryOptions(wallId));
    const wallSlug = useMemo(() => String((wall as any).wallId ?? ''), [wall]);

    const metadataMutation = useMutation({
        mutationFn: async (name: string) =>
            $adminUpdateWallMetadata({
                data: {
                    wallId,
                    name
                }
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: adminWallQueryOptions(wallId).queryKey });
            queryClient.invalidateQueries({ queryKey: ['admin', 'walls'] });
            toast.success('Wall metadata updated');
        },
        onError: (e: any) => toast.error(e.message ?? 'Failed to update metadata')
    });

    const form = useForm({
        defaultValues: {
            name: (wall as any).name ?? (wall as any).wallId ?? ''
        },
        onSubmit: async ({ value }) => {
            await metadataMutation.mutateAsync(value.name);
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async () => $adminDeleteWall({ data: { wallId } }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'walls'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'devices'] });
            toast.success('Wall deleted');
            navigate({ to: '/admin/walls' });
        },
        onError: (e: any) => toast.error(e.message ?? 'Failed to delete wall')
    });

    return (
        <div className="flex flex-col gap-4">
            <div className="space-y-1">
                <form.Field name="name">
                    {(field) => (
                        <>
                            <Label htmlFor={field.name}>Display Name</Label>
                            <Input
                                id={field.name}
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                            />
                        </>
                    )}
                </form.Field>
            </div>
            <div className="space-y-1">
                <Label htmlFor="wall-slug">Slug</Label>
                <Input id="wall-slug" value={wallSlug} readOnly />
            </div>
            <div className="mt-4 flex items-center gap-2">
                <Button disabled={metadataMutation.isPending} onClick={() => form.handleSubmit()}>
                    Save
                </Button>
                <Button
                    variant="destructive"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                        if (
                            window.confirm(
                                `Delete wall "${wallSlug || wallId}" and unassign all its devices?`
                            )
                        ) {
                            deleteMutation.mutate();
                        }
                    }}
                >
                    Delete Wall
                </Button>
            </div>
        </div>
    );
}
