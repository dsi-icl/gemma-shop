import { ProhibitIcon, ShieldCheckIcon } from '@phosphor-icons/react';
import { authQueryOptions } from '@repo/auth/tanstack/queries';
import { Button } from '@repo/ui/components/button';
import { DateDisplay } from '@repo/ui/components/date-display';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue
} from '@repo/ui/components/select';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { toast } from 'sonner';

import {
    $adminSetUserBanStatus,
    $adminSetUserRole,
    $adminSetUserTrustedPublisher
} from '~/server/admin.fns';
import { adminUsersQueryOptions } from '~/server/admin.queries';

export const Route = createFileRoute('/admin/users')({
    loader: ({ context }) => {
        context.queryClient.ensureQueryData(adminUsersQueryOptions());
    },
    component: AdminUsers,
    head: () => ({
        meta: [{ title: 'Users · Admin · GemmaShop' }]
    })
});

function AdminUsers() {
    const { data: users } = useSuspenseQuery(adminUsersQueryOptions());
    const { data: currentUser } = useSuspenseQuery(authQueryOptions());
    const isAdminActor = currentUser?.role === 'admin';
    const queryClient = useQueryClient();

    const banMutation = useMutation({
        mutationFn: async ({ userId, banned }: { userId: string; banned: boolean }) => {
            await $adminSetUserBanStatus({ data: { userId, banned } });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
            toast.success('User updated');
        },
        onError: (e: any) => toast.error(e.message)
    });

    const roleMutation = useMutation({
        mutationFn: async ({
            userId,
            userEmail,
            role
        }: {
            userId?: string;
            userEmail: string;
            role: 'admin' | 'operator' | 'user';
        }) => {
            await $adminSetUserRole({ data: { userId, userEmail, role } });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
            toast.success('User role updated');
        },
        onError: (e: any) => toast.error(e.message)
    });

    const trustedPublisherMutation = useMutation({
        mutationFn: async ({
            userId,
            trustedPublisher
        }: {
            userId: string;
            trustedPublisher: boolean;
        }) => {
            await $adminSetUserTrustedPublisher({ data: { userId, trustedPublisher } });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
            toast.success('Trusted publisher status updated');
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
                            <th className="px-4 py-3 text-left font-medium">Publishing</th>
                            <th className="px-4 py-3 text-left font-medium">Created</th>
                            <th className="px-4 py-3 text-left font-medium">Status</th>
                            <th className="px-4 py-3 text-left font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {users.map((user: any) => {
                            const isCurrentUser =
                                typeof user?.id === 'string' &&
                                typeof currentUser?.id === 'string' &&
                                user.id === currentUser.id;
                            return (
                                <tr key={user.id} className="hover:bg-muted/30">
                                    <td className="px-4 py-3 font-mono text-xs">{user.email}</td>
                                    <td className="px-4 py-3">
                                        {isAdminActor ? (
                                            <Select
                                                value={
                                                    user.role === 'admin'
                                                        ? 'admin'
                                                        : user.role === 'operator'
                                                          ? 'operator'
                                                          : 'user'
                                                }
                                                onValueChange={(value) =>
                                                    roleMutation.mutate({
                                                        userId: user.id,
                                                        userEmail: user.email,
                                                        role: value as 'admin' | 'operator' | 'user'
                                                    })
                                                }
                                                disabled={
                                                    roleMutation.isPending ||
                                                    trustedPublisherMutation.isPending ||
                                                    banMutation.isPending ||
                                                    isCurrentUser
                                                }
                                            >
                                                <SelectTrigger
                                                    className={`h-7 min-w-24 rounded-full border-0 px-2 py-0.5 text-xs font-medium ${user.role === `admin` ? `bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400` : `bg-muted text-muted-foreground`}`}
                                                >
                                                    {user.role === 'admin' && (
                                                        <ShieldCheckIcon size={10} />
                                                    )}
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectGroup>
                                                        <SelectLabel>Role</SelectLabel>
                                                        <SelectItem value="user">User</SelectItem>
                                                        <SelectItem value="operator">
                                                            Operator
                                                        </SelectItem>
                                                        <SelectItem value="admin">Admin</SelectItem>
                                                    </SelectGroup>
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <span className="inline-flex h-7 min-w-24 items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                                {user.role === 'admin'
                                                    ? 'Admin'
                                                    : user.role === 'operator'
                                                      ? 'Operator'
                                                      : 'User'}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <Select
                                            value={
                                                user.trustedPublisher === true
                                                    ? 'trusted'
                                                    : 'blocked'
                                            }
                                            onValueChange={(value) =>
                                                trustedPublisherMutation.mutate({
                                                    userId: user.id,
                                                    trustedPublisher: value === 'trusted'
                                                })
                                            }
                                        >
                                            <SelectTrigger className="h-7 min-w-28 rounded-full border-0 bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectGroup>
                                                    <SelectLabel>Publishing</SelectLabel>
                                                    <SelectItem value="blocked">Blocked</SelectItem>
                                                    <SelectItem value="trusted">Trusted</SelectItem>
                                                </SelectGroup>
                                            </SelectContent>
                                        </Select>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        <DateDisplay value={user.createdAt} />
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
                                        {isAdminActor ? (
                                            <Button
                                                variant={user.banned ? 'outline' : 'ghost'}
                                                size="sm"
                                                onClick={() =>
                                                    banMutation.mutate({
                                                        userId: user.id,
                                                        banned: !user.banned
                                                    })
                                                }
                                                disabled={
                                                    banMutation.isPending ||
                                                    trustedPublisherMutation.isPending ||
                                                    roleMutation.isPending ||
                                                    isCurrentUser
                                                }
                                            >
                                                <ProhibitIcon size={14} />
                                                {user.banned ? 'Unban' : 'Ban'}
                                            </Button>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">-</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
