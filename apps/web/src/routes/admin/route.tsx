import {
    CastleTurretIcon,
    ChartBarIcon,
    FolderIcon,
    ImageIcon,
    MonitorIcon,
    UsersIcon
} from '@phosphor-icons/react';
import { useAuthSuspense } from '@repo/auth/tanstack/hooks';
import { authQueryOptions } from '@repo/auth/tanstack/queries';
import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/admin')({
    component: AdminLayout,
    beforeLoad: async ({ context }) => {
        const user = await context.queryClient.ensureQueryData({
            ...authQueryOptions(),
            revalidateIfStale: true
        });
        if (!user) throw redirect({ to: '/login' });
        if ((user as any).role !== 'admin') throw redirect({ to: '/quarry' });
        return { user };
    }
});

const NAV = [
    { to: '/admin/users', label: 'Users', icon: UsersIcon },
    { to: '/admin/projects', label: 'Projects', icon: FolderIcon },
    { to: '/admin/walls', label: 'Walls', icon: MonitorIcon },
    { to: '/admin/assets', label: 'Public Assets', icon: ImageIcon },
    { to: '/admin/stats', label: 'Stats', icon: ChartBarIcon }
] as const;

function AdminLayout() {
    return (
        <div className="flex min-h-svh">
            <nav className="flex w-52 shrink-0 flex-col gap-1 border-r border-border bg-card p-3 pt-18">
                <div className="mb-3 flex items-center gap-2 px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    <CastleTurretIcon size={14} /> Administration
                </div>
                {NAV.map(({ to, label, icon: Icon }) => (
                    <Link
                        key={to}
                        to={to}
                        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent [&.active]:bg-accent [&.active]:font-medium"
                    >
                        <Icon size={16} />
                        {label}
                    </Link>
                ))}
            </nav>
            <main className="flex flex-1 flex-col overflow-auto p-6 pt-18">
                <Outlet />
            </main>
        </div>
    );
}
