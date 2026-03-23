import {
    CastleTurretIcon,
    ChartBarIcon,
    GearIcon,
    FolderIcon,
    ImageIcon,
    MonitorIcon,
    UsersIcon
} from '@phosphor-icons/react';
import { authQueryOptions } from '@repo/auth/tanstack/queries';
import { Tabs, TabsList, TabsTrigger } from '@repo/ui/components/tabs';
import {
    createFileRoute,
    Outlet,
    redirect,
    useLocation,
    useNavigate,
    useRouterState
} from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Suspense } from 'react';

import { $finalizeFirstAdminForCurrentUser } from '~/server/bootstrap.fns';

export const Route = createFileRoute('/admin')({
    component: AdminLayout,
    beforeLoad: async ({ context }) => {
        let user = await context.queryClient.ensureQueryData({
            ...authQueryOptions(),
            revalidateIfStale: true
        });
        if (!user) throw redirect({ to: '/login' });
        const promotion = await $finalizeFirstAdminForCurrentUser();
        if (promotion.promoted) {
            await context.queryClient.invalidateQueries({ queryKey: authQueryOptions().queryKey });
            user = await context.queryClient.fetchQuery({
                ...authQueryOptions(),
                revalidateIfStale: true
            });
        }
        if ((user as any).role !== 'admin') throw redirect({ to: '/quarry' });
        return { user };
    }
});

const NAV = [
    { to: '/admin/users', label: 'Users', icon: UsersIcon },
    { to: '/admin/projects', label: 'Projects', icon: FolderIcon },
    { to: '/admin/walls', label: 'Walls', icon: MonitorIcon },
    { to: '/admin/assets', label: 'Public Assets', icon: ImageIcon },
    { to: '/admin/config', label: 'Config', icon: GearIcon },
    { to: '/admin/stats', label: 'Stats', icon: ChartBarIcon }
] as const;

const TAB_ORDER = {
    users: 0,
    projects: 1,
    walls: 2,
    assets: 3,
    config: 4,
    stats: 5
} as const;

type AdminTabKey = keyof typeof TAB_ORDER;

const slidePanelVariants = {
    enter: () => ({
        opacity: 0,
        filter: 'blur(2px)'
    }),
    center: {
        opacity: 1,
        filter: 'blur(0px)'
    },
    exit: () => ({
        opacity: 0,
        filter: 'blur(2px)'
    })
};

function getTabFromPath(pathname: string): AdminTabKey {
    if (pathname.endsWith('/projects')) return 'projects';
    if (pathname.endsWith('/walls')) return 'walls';
    if (pathname.endsWith('/assets')) return 'assets';
    if (pathname.endsWith('/config')) return 'config';
    if (pathname.endsWith('/stats')) return 'stats';
    return 'users';
}

function AdminLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const currentTab = getTabFromPath(location.pathname);
    const resolvedPathname = useRouterState({
        select: (s) => s.location.pathname
    });

    return (
        <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-6 pt-18 pb-6">
            <div className="mb-6 flex items-center gap-3">
                <CastleTurretIcon size={18} />
                <h2 className="text-xl font-semibold">Administration</h2>
            </div>

            <Tabs
                value={currentTab}
                onValueChange={(value) => {
                    const tab = NAV.find((t) => t.to.split('/').pop() === value);
                    if (!tab) return;
                    navigate({ to: tab.to as any });
                }}
                className="mb-6"
            >
                <TabsList variant="line">
                    {NAV.map(({ to, label, icon: Icon }) => {
                        const key = to.split('/').pop() as AdminTabKey;
                        return (
                            <TabsTrigger key={to} value={key}>
                                <span className="flex items-center gap-1.5">
                                    <Icon size={14} />
                                    {label}
                                </span>
                            </TabsTrigger>
                        );
                    })}
                </TabsList>
            </Tabs>

            <div className="relative grid min-h-0 flex-1">
                <AnimatePresence mode="sync" initial={false}>
                    <motion.div
                        key={resolvedPathname}
                        className="col-start-1 row-start-1 w-full"
                        variants={slidePanelVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    >
                        <Suspense
                            fallback={
                                <div className="space-y-3">
                                    <div className="h-7 w-40 animate-pulse rounded bg-muted" />
                                    <div className="h-40 animate-pulse rounded-xl border border-border bg-muted/30" />
                                    <div className="h-40 animate-pulse rounded-xl border border-border bg-muted/30" />
                                </div>
                            }
                        >
                            <Outlet />
                        </Suspense>
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
