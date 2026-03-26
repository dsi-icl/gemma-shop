import { ProhibitIcon, ShieldCheckIcon } from '@phosphor-icons/react';
import authClient from '@repo/auth/auth-client';
import { Button } from '@repo/ui/components/button';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { toast } from 'sonner';

import { formatDateValue } from '~/lib/safeDate';
import { adminUsersQueryOptions } from '~/server/admin.queries';

export const Route = createFileRoute('/admin/users')({
    component: AdminUsers,
    loader: ({ context }) => {
        context.queryClient.ensureQueryData(adminUsersQueryOptions());
    }
});

function AdminUsers() {
    const { data: users = [] } = useSuspenseQuery(adminUsersQueryOptions());
    const queryClient = useQueryClient();

    const banMutation = useMutation({
        mutationFn: async ({ userId, banned }: { userId: string; banned: boolean }) => {
            if (banned) {
                await (authClient as any).admin.banUser({ userId });
            } else {
                await (authClient as any).admin.unbanUser({ userId });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
            toast.success('User updated');
        },
        onError: (e: any) => toast.error(e.message)
    });

    return (
        <div>
            <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium">Email</th>
                            <th className="px-4 py-3 text-left font-medium">Role</th>
                            <th className="px-4 py-3 text-left font-medium">Created</th>
                            <th className="px-4 py-3 text-left font-medium">Status</th>
                            <th className="px-4 py-3 text-left font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {users.map((user: any) => (
                            <tr key={user.id} className="hover:bg-muted/30">
                                <td className="px-4 py-3 font-mono text-xs">{user.email}</td>
                                <td className="px-4 py-3">
                                    <span
                                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${user.role === `admin` ? `bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400` : `bg-muted text-muted-foreground`}`}
                                    >
                                        {user.role === 'admin' && <ShieldCheckIcon size={10} />}
                                        {user.role ?? 'user'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                    {formatDateValue(user.createdAt, 'd MMM yyyy')}
                                </td>
                                <td className="px-4 py-3">
                                    {user.banned ? (
                                        <span className="text-xs text-destructive">Banned</span>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-green-600 dark:text-green-400">
                                                Active
                                            </span>
                                            {user.isActiveSession && (
                                                <span className="text-[10px] text-muted-foreground">
                                                    Session live
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <Button
                                        variant={user.banned ? 'outline' : 'ghost'}
                                        size="sm"
                                        onClick={() =>
                                            banMutation.mutate({
                                                userId: user.id,
                                                banned: !user.banned
                                            })
                                        }
                                        disabled={banMutation.isPending}
                                    >
                                        <ProhibitIcon size={14} />
                                        {user.banned ? 'Unban' : 'Ban'}
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
