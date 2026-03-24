import { Button } from '@repo/ui/components/button';
import type { Project } from '@repo/ui/components/project-card';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useLocation } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { GalleryProjectCard } from '~/components/GalleryProjectCard';
import { GalleryEngine } from '~/lib/galleryEngine';
import { publishedProjectsQueryOptions } from '~/server/projects.queries';
import { wallsQueryOptions } from '~/server/walls.queries';

export const Route = createFileRoute('/gallery/')({
    component: HomePage,
    loader: ({ context }) => {
        context.queryClient.ensureQueryData(publishedProjectsQueryOptions());
    }
});

type ProjectWithId = Project & { _id: string; publishedCommitId?: string | null };
type WallListEntry = {
    wallId: string;
    name: string;
    connectedNodes: number;
    boundProjectId?: string | null;
    boundCommitId?: string | null;
    boundSlideId?: string | null;
    boundSource?: 'live' | 'gallery' | null;
};

function HomePage() {
    const [activeTag, setActiveTag] = useState<string | null>(null);
    const [autoOpenRevision, setAutoOpenRevision] = useState(0);
    const { data: publishedProjects = [] } = useQuery(publishedProjectsQueryOptions());
    const { data: walls = [] } = useQuery(wallsQueryOptions());
    const queryClient = useQueryClient();
    const searchStr = useLocation({ select: (location) => location.searchStr });
    const [pendingOverride, setPendingOverride] = useState<{
        requestId: string;
        wallId: string;
        projectId: string;
        commitId: string;
        slideId: string;
        expiresAt: number;
        requesterEmail?: string;
    } | null>(null);
    const [overrideClockNow, setOverrideClockNow] = useState<number>(() => Date.now());

    const formatRequesterLabel = (email?: string) => {
        // TODO Lookup through university LDAP to get names maybe ?
        return `${email}`;
    };

    const wallId = useMemo(() => {
        const params = new URLSearchParams(searchStr);
        const w = params.get('w');
        return w && w.trim().length > 0 ? w : null;
    }, [searchStr]);

    const galleryEngine = useMemo(
        () => (typeof window !== 'undefined' ? GalleryEngine.getInstance(wallId) : null),
        [wallId]
    );

    useEffect(() => {
        if (!galleryEngine) return;
        const wallsQueryKey = wallsQueryOptions().queryKey;
        const publishedProjectsQueryKey = publishedProjectsQueryOptions().queryKey;

        const setWallBinding = (
            wallState:
                | {
                      wallId: string;
                      connectedNodes?: number;
                      bound: boolean;
                      projectId?: string;
                      commitId?: string;
                      slideId?: string;
                      source?: 'live' | 'gallery';
                  }
                | {
                      wallId: string;
                      connectedNodes?: number;
                      boundProjectId: string | null;
                      boundCommitId: string | null;
                      boundSlideId: string | null;
                      boundSource: 'live' | 'gallery' | null;
                  }
        ) => {
            queryClient.setQueryData<WallListEntry[]>(wallsQueryKey, (current) => {
                const list: WallListEntry[] = Array.isArray(current) ? [...current] : [];
                const idx = list.findIndex((wall) => wall.wallId === wallState.wallId);
                const existing: WallListEntry | undefined = idx >= 0 ? list[idx] : undefined;

                const next: WallListEntry = existing
                    ? { ...existing }
                    : {
                          wallId: wallState.wallId,
                          name: wallState.wallId,
                          connectedNodes:
                              typeof wallState.connectedNodes === 'number'
                                  ? wallState.connectedNodes
                                  : 0,
                          boundProjectId: null,
                          boundCommitId: null,
                          boundSlideId: null,
                          boundSource: null
                      };

                if ('bound' in wallState) {
                    next.boundProjectId = wallState.bound ? (wallState.projectId ?? null) : null;
                    next.boundCommitId = wallState.bound ? (wallState.commitId ?? null) : null;
                    next.boundSlideId = wallState.bound ? (wallState.slideId ?? null) : null;
                    next.boundSource = wallState.bound ? (wallState.source ?? null) : null;
                } else {
                    next.boundProjectId = wallState.boundProjectId;
                    next.boundCommitId = wallState.boundCommitId;
                    next.boundSlideId = wallState.boundSlideId;
                    next.boundSource = wallState.boundSource;
                }

                if (typeof wallState.connectedNodes === 'number') {
                    next.connectedNodes = wallState.connectedNodes;
                }

                if (idx >= 0) {
                    list[idx] = next;
                } else {
                    list.push(next);
                }
                return list;
            });
        };

        const unsubs = [
            galleryEngine.onGalleryState((snapshot) => {
                queryClient.setQueryData<WallListEntry[]>(wallsQueryKey, (current) => {
                    const byWallId = new Map(
                        (Array.isArray(current) ? current : []).map((wall) => [wall.wallId, wall])
                    );
                    for (const wall of snapshot.walls) {
                        const existing = byWallId.get(wall.wallId);
                        byWallId.set(wall.wallId, {
                            wallId: wall.wallId,
                            name: existing?.name ?? wall.wallId,
                            connectedNodes: wall.connectedNodes,
                            boundProjectId: wall.bound ? (wall.projectId ?? null) : null,
                            boundCommitId: wall.bound ? (wall.commitId ?? null) : null,
                            boundSlideId: wall.bound ? (wall.slideId ?? null) : null,
                            boundSource: existing?.boundSource ?? null
                        });
                    }
                    return Array.from(byWallId.values());
                });
            }),
            galleryEngine.onProjectPublishChanged((event) => {
                if (!event.published) {
                    queryClient.setQueryData<ProjectWithId[]>(
                        publishedProjectsQueryKey,
                        (current) =>
                            (Array.isArray(current) ? current : []).filter(
                                (project) => project._id !== event.projectId
                            )
                    );
                }

                void queryClient.invalidateQueries({
                    queryKey: publishedProjectsQueryKey
                });
            }),
            galleryEngine.onWallBindingChanged((event) => {
                setWallBinding({
                    wallId: event.wallId,
                    bound: event.bound,
                    projectId: event.projectId,
                    commitId: event.commitId,
                    slideId: event.slideId,
                    source: event.source
                });
                if (wallId && event.wallId === wallId) {
                    setAutoOpenRevision((v) => v + 1);
                }
            }),
            galleryEngine.onWallUnbound((event) => {
                setWallBinding({
                    wallId: event.wallId,
                    bound: false
                });
                if (wallId && event.wallId === wallId) {
                    setAutoOpenRevision((v) => v + 1);
                }
            }),
            galleryEngine.onBindOverrideRequested((req) => {
                if (!wallId || req.wallId !== wallId) return;
                setPendingOverride(req);
                toast.message(`${formatRequesterLabel(req.requesterEmail)} wants to take over.`);
            }),
            galleryEngine.onBindOverrideResult((result) => {
                if (!pendingOverride || result.requestId !== pendingOverride.requestId) return;
                setPendingOverride(null);
                if (!result.allow) {
                    toast.message(
                        result.reason === 'timeout'
                            ? 'The takeover request expired.'
                            : 'Takeover request declined.'
                    );
                }
            })
        ];
        return () => {
            for (const unsub of unsubs) unsub();
        };
    }, [galleryEngine, queryClient, wallId, pendingOverride]);

    useEffect(() => {
        if (!pendingOverride) return;
        const tick = () => {
            setOverrideClockNow(Date.now());
        };
        tick();
        const id = window.setInterval(tick, 250);
        return () => window.clearInterval(id);
    }, [pendingOverride]);

    const overrideSecondsLeft = pendingOverride
        ? Math.ceil(Math.max(0, pendingOverride.expiresAt - overrideClockNow) / 1000)
        : 0;

    const decideOverride = (allow: boolean) => {
        if (!galleryEngine || !pendingOverride) return;
        galleryEngine.decideBindOverride(pendingOverride.requestId, pendingOverride.wallId, allow);
        setPendingOverride(null);
    };

    const projectsData: ProjectWithId[] = useMemo(
        () =>
            publishedProjects.map((p) => ({
                _id: p._id,
                name: p.name,
                author: p.authorOrganisation,
                description: p.description,
                tags: p.tags.filter((t) => t !== 'public'),
                publishedCommitId: p.publishedCommitId,
                imageUrl: p.heroImages[0] ?? ''
            })),
        [publishedProjects]
    );

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        for (const p of projectsData) {
            for (const t of p.tags) {
                tags.add(t);
            }
        }
        return Array.from(tags);
    }, [projectsData]);

    const filteredProjects = useMemo(() => {
        if (!activeTag) return projectsData;
        return projectsData.filter((p) => p.tags.includes(activeTag));
    }, [activeTag, projectsData]);

    const autoOpenProjectId = useMemo(() => {
        if (!wallId) return null;
        const targetWall = walls.find((wall) => wall.wallId === wallId);
        if (!targetWall?.boundProjectId) return null;
        const boundSource = (targetWall as { boundSource?: 'live' | 'gallery' | null }).boundSource;
        if (boundSource === 'live') return null;
        return targetWall.boundProjectId;
    }, [wallId, walls]);

    const autoOpenSignal = useMemo(() => {
        if (!wallId || !autoOpenProjectId) return null;
        return `wall:${wallId}:project:${autoOpenProjectId}:rev:${autoOpenRevision}`;
    }, [wallId, autoOpenProjectId, autoOpenRevision]);

    useEffect(() => {
        if (!autoOpenProjectId) return;
        if (activeTag === null) return;
        setActiveTag(null);
    }, [autoOpenProjectId, activeTag]);

    return (
        <div className="container mx-auto p-4 pt-24">
            {pendingOverride ? (
                <div className="fixed inset-0 z-[80] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/85" />
                    <div className="relative z-[81] w-[min(42rem,95vw)] rounded-lg border border-border bg-card p-4 shadow-2xl">
                        <div className="flex flex-col gap-3">
                            <div className="text-sm font-semibold">
                                Takeover request from{' '}
                                {formatRequesterLabel(pendingOverride.requesterEmail)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                <span className="font-bold">
                                    {formatRequesterLabel(pendingOverride.requesterEmail)}
                                </span>{' '}
                                wants to take over the wall. Approving will switch away from the
                                current live content.
                            </div>
                            <div className="text-xs text-muted-foreground">
                                For safety, this request auto-declines in {overrideSecondsLeft}s.
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => decideOverride(false)}
                                >
                                    Deny
                                </Button>
                                <Button size="sm" onClick={() => decideOverride(true)}>
                                    Approve
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
            <div className="flex flex-col gap-8 md:flex-row">
                <aside className="w-full md:w-1/5">
                    <h2 className="mb-4 text-lg font-semibold">Filters</h2>
                    <div className="flex flex-wrap gap-2 md:flex-col md:flex-nowrap">
                        <Button
                            variant={!activeTag ? 'secondary' : 'ghost'}
                            onClick={() => setActiveTag(null)}
                            className="justify-start"
                        >
                            All ({projectsData.length})
                        </Button>
                        {allTags.map((tag) => (
                            <Button
                                key={tag}
                                variant={activeTag === tag ? 'secondary' : 'ghost'}
                                onClick={() => setActiveTag(tag)}
                                className="justify-start"
                            >
                                {tag}
                            </Button>
                        ))}
                    </div>
                </aside>
                <main className="w-full md:w-4/5">
                    {filteredProjects.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-12 text-muted-foreground">
                            <p>No published projects yet</p>
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            <AnimatePresence mode="popLayout">
                                {filteredProjects.map((project) => (
                                    <motion.div
                                        key={project._id}
                                        layout
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{
                                            type: 'spring',
                                            duration: 0.3,
                                            bounce: 0.2
                                        }}
                                    >
                                        <GalleryProjectCard
                                            project={project}
                                            autoOpenSignal={
                                                autoOpenProjectId === project._id
                                                    ? autoOpenSignal
                                                    : null
                                            }
                                        />
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
