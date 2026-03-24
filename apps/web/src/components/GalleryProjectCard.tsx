import type { Project } from '@repo/ui/components/project-card';
import { ProjectCard } from '@repo/ui/components/project-card';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';

import { ControllerEngine } from '~/lib/controllerEngine';
import { GalleryEngine } from '~/lib/galleryEngine';
import { $bindWall } from '~/server/walls.fns';
import { wallsQueryOptions } from '~/server/walls.queries';

interface GalleryProjectCardProps {
    project: Project & {
        _id: string;
        publishedCommitId?: string | null;
    };
    autoOpenSignal?: string | number | null;
    forceDemoteFullscreenSignal?: string | number | null;
    forceCloseSignal?: string | number | null;
}

export function GalleryProjectCard({
    project,
    autoOpenSignal,
    forceDemoteFullscreenSignal,
    forceCloseSignal
}: GalleryProjectCardProps) {
    const { data: walls = [] } = useQuery(wallsQueryOptions());
    const presetWallId = useMemo(() => {
        if (typeof window === 'undefined') return null;
        const params = new URLSearchParams(window.location.search);
        return params.get('w');
    }, []);

    const availableWalls = walls.map((wall) => ({
        id: wall.wallId,
        name: wall.name,
        connectedNodes: wall.connectedNodes,
        isBound: Boolean(wall.boundProjectId)
    }));

    const handleLoadProject = async (wallId: string) => {
        if (!project.publishedCommitId) {
            toast.error('This project has no published commit');
            return false;
        }

        try {
            await $bindWall({
                data: {
                    wallId,
                    projectId: project._id,
                    commitId: project.publishedCommitId,
                    slideId: 'default'
                }
            });
            toast.success('Project loaded on wall');
            return true;
        } catch (e: any) {
            toast.error(e?.message ?? 'Could not load project on wall');
            return false;
        }
    };

    const handleWallRebootRequest = async (wallId: string) => {
        try {
            const engine = ControllerEngine.getInstance(wallId);
            engine.sendJSON({ type: 'reboot' });
            return true;
        } catch (e: any) {
            toast.error(e?.message ?? 'Could not refresh wall screens');
            return false;
        }
    };

    const handleWallUnbindRequest = async (wallId: string) => {
        try {
            const engine = GalleryEngine.getInstance(presetWallId);
            engine.unbindWall(wallId);
            return true;
        } catch (e: any) {
            toast.error(e?.message ?? 'Could not unbind wall');
            return false;
        }
    };

    return (
        <ProjectCard
            project={project}
            autoOpenSignal={autoOpenSignal}
            forceDemoteFullscreenSignal={forceDemoteFullscreenSignal}
            forceCloseSignal={forceCloseSignal}
            availableWalls={availableWalls}
            onLoadProject={handleLoadProject}
            onWallRebootRequest={handleWallRebootRequest}
            onWallUnbindRequest={handleWallUnbindRequest}
            presetWallId={presetWallId}
        />
    );
}
