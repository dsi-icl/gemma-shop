import { ArrowLeftIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Tabs, TabsList, TabsTrigger } from '@repo/ui/components/tabs';
import { useSuspenseQuery } from '@tanstack/react-query';
import {
    createFileRoute,
    Link,
    Outlet,
    useLocation,
    useNavigate,
    useRouterState
} from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';

import { $ensureMutableHead, $getCommit } from '~/server/projects.fns';
import { projectQueryOptions } from '~/server/projects.queries';

export const Route = createFileRoute('/_auth/quarry/projects/$projectId')({
    component: ProjectLayout,
    loader: ({ context, params }) => {
        context.queryClient.ensureQueryData(projectQueryOptions(params.projectId));
    }
});

const TAB_ORDER = { info: 0, permissions: 1, commits: 2, history: 3, assets: 4 } as const;
type TabKey = keyof typeof TAB_ORDER;

const TABS: { key: TabKey; label: string; to: string }[] = [
    { key: 'info', label: 'Project Info', to: '.' },
    { key: 'permissions', label: 'Permissions', to: './permissions' },
    { key: 'commits', label: 'Commits', to: './commits' },
    { key: 'history', label: 'History', to: './history' },
    { key: 'assets', label: 'Assets', to: './assets' }
];

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

function getTabFromPath(pathname: string): TabKey {
    if (pathname.endsWith('/permissions')) return 'permissions';
    if (pathname.endsWith('/commits')) return 'commits';
    if (pathname.endsWith('/history')) return 'history';
    if (pathname.endsWith('/assets')) return 'assets';
    return 'info';
}

function ProjectLayout() {
    const { projectId } = Route.useParams();
    const { data: project } = useSuspenseQuery(projectQueryOptions(projectId));
    const location = useLocation();
    const navigate = useNavigate();
    const currentTab = getTabFromPath(location.pathname);

    const resolvedPathname = useRouterState({
        select: (s) => s.location.pathname
    });

    return (
        <div className="mx-auto w-full max-w-3xl">
            <div className="mb-6 flex items-center gap-3">
                <Button
                    render={<Link to="/quarry" />}
                    variant="ghost"
                    size="icon-sm"
                    nativeButton={false}
                >
                    <ArrowLeftIcon />
                </Button>
                <h2 className="text-xl font-semibold">{project.name}</h2>
                {project.publishedCommitId && (
                    <Badge variant="default" className="text-xs">
                        Published
                    </Badge>
                )}
                <Button
                    variant="default"
                    size="sm"
                    className="ml-auto"
                    onClick={async () => {
                        const headCommitId = await $ensureMutableHead({
                            data: { projectId }
                        });
                        const commit = await $getCommit({ data: { id: headCommitId } });
                        const firstSlideId = commit?.content?.slides?.[0]?.id ?? 'default';
                        navigate({
                            to: '/quarry/editor/$projectId/$commitId/$slideId',
                            params: { projectId, commitId: headCommitId, slideId: firstSlideId }
                        });
                    }}
                >
                    <PencilSimpleIcon weight="bold" /> Edit
                </Button>
            </div>

            <Tabs
                value={currentTab}
                onValueChange={(value) => {
                    const tab = TABS.find((t) => t.key === value);
                    if (tab) {
                        navigate({
                            from: '/quarry/projects/$projectId',
                            to: tab.to
                        });
                    }
                }}
                className="mb-6"
            >
                <TabsList variant="line">
                    {TABS.map((tab) => (
                        <TabsTrigger key={tab.key} value={tab.key}>
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            <div className="relative grid">
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
                        <Outlet />
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
