import { Button } from '@repo/ui/components/button';
import type { Project } from '@repo/ui/components/project-card';
import { ProjectCard } from '@repo/ui/components/project-card';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { WallPicker } from '~/components/WallPicker';
import { publishedProjectsQueryOptions } from '~/server/projects.queries';
import { $bindWall } from '~/server/walls.fns';

export const Route = createFileRoute('/gallery/')({
    ssr: 'data-only',
    component: HomePage,
    loader: ({ context }) => {
        context.queryClient.ensureQueryData(publishedProjectsQueryOptions());
    }
});

type ProjectWithId = Project & { _id: string };

function HomePage() {
    const [activeTag, setActiveTag] = useState<string | null>(null);
    const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
    const { data: publishedProjects = [] } = useQuery(publishedProjectsQueryOptions());

    const projectsData: ProjectWithId[] = useMemo(
        () =>
            publishedProjects.map((p) => ({
                _id: p._id,
                name: p.name,
                author: p.authorOrganisation,
                description: p.description,
                tags: p.tags.filter((t) => t !== 'public'),
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

    const handleWallSelected = async (wallId: string) => {
        if (!pendingProjectId) return;
        const project = publishedProjects.find((p) => p._id === pendingProjectId);
        if (!project?.publishedCommitId) return;
        try {
            await $bindWall({
                data: {
                    wallId,
                    projectId: pendingProjectId,
                    commitId: project.publishedCommitId,
                    slideId: 'default'
                }
            });
            toast.success('Project loaded on wall');
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setPendingProjectId(null);
        }
    };

    return (
        <div className="container mx-auto p-4 pt-24">
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
                                        key={project.name}
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
                                        <ProjectCard
                                            project={project}
                                            onLoadProject={() => setPendingProjectId(project._id)}
                                        />
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </main>
            </div>

            {pendingProjectId && (
                <WallPicker
                    onSelect={handleWallSelected}
                    onClose={() => setPendingProjectId(null)}
                />
            )}
        </div>
    );
}
