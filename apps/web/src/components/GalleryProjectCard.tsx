import { useAuth } from '@repo/auth/tanstack/hooks';
import type { Project } from '@repo/ui/components/project-card';
import { ProjectCard } from '@repo/ui/components/project-card';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';

import { GalleryEngine } from '~/lib/galleryEngine';
import { $issueControllerPortalToken } from '~/server/portal.fns';
import { wallsQueryOptions } from '~/server/walls.queries';

interface GalleryProjectCardProps {
    project: Project & {
        _id: string;
        publishedCommitId?: string | null;
    };
    autoOpenSignal?: string | number | null;
    forceDemoteFullscreenSignal?: string | number | null;
    forceCloseMinimizedSignal?: string | number | null;
    forceCloseSignal?: string | number | null;
    allowWallActions?: boolean;
}

export function GalleryProjectCard({
    project,
    autoOpenSignal,
    forceDemoteFullscreenSignal,
    forceCloseMinimizedSignal,
    forceCloseSignal,
    allowWallActions = true
}: GalleryProjectCardProps) {
    const { user } = useAuth();
    const canManageWalls = Boolean(user) && allowWallActions;
    const { data: walls = [] } = useQuery({
        ...wallsQueryOptions(),
        enabled: canManageWalls
    });
    const presetWallId = useMemo(() => {
        if (typeof window === 'undefined') return null;
        const params = new URLSearchParams(window.location.search);
        return params.get('w');
    }, []);

    const availableWalls = canManageWalls
        ? walls.map((wall) => ({
              id: wall.wallId,
              name: wall.name,
              connectedNodes: wall.connectedNodes,
              isBound: Boolean(wall.boundProjectId)
          }))
        : [];

    const handleLoadProject = useCallback(
        async (wallId: string) => {
            if (!project.publishedCommitId) {
                toast.error('This project has no published commit');
                return false;
            }

            try {
                const engine = GalleryEngine.getInstance(presetWallId);
                engine.sendJSON({
                    type: 'bind_wall',
                    wallId,
                    projectId: project._id,
                    commitId: project.publishedCommitId,
                    slideId: 'default'
                });
                toast.success('Project loaded on wall');
                return true;
            } catch (e: any) {
                toast.error(e?.message ?? 'Could not load project on wall');
                return false;
            }
        },
        [presetWallId, project._id, project.publishedCommitId]
    );

    const handleWallRebootRequest = useCallback(
        async (_wallId: string) => {
            try {
                const engine = GalleryEngine.getInstance(presetWallId);
                engine.sendJSON({ type: 'reboot' });
                return true;
            } catch (e: any) {
                toast.error(e?.message ?? 'Could not refresh wall screens');
                return false;
            }
        },
        [presetWallId]
    );

    const handleWallUnbindRequest = useCallback(
        async (wallId: string) => {
            try {
                const engine = GalleryEngine.getInstance(presetWallId);
                engine.unbindWall(wallId);
                return true;
            } catch (e: any) {
                toast.error(e?.message ?? 'Could not unbind wall');
                return false;
            }
        },
        [presetWallId]
    );

    const handleControllerTokenRequest = useCallback(async (wallId: string) => {
        try {
            const result = await $issueControllerPortalToken({ data: { wallId } });
            return result.token;
        } catch (e: any) {
            toast.error(e?.message ?? 'Could not initialize controller API token');
            return null;
        }
    }, []);

    return (
        <ProjectCard
            project={project}
            autoOpenSignal={autoOpenSignal}
            forceDemoteFullscreenSignal={forceDemoteFullscreenSignal}
            forceCloseMinimizedSignal={forceCloseMinimizedSignal}
            forceCloseSignal={forceCloseSignal}
            availableWalls={availableWalls}
            onLoadProject={canManageWalls ? handleLoadProject : undefined}
            onWallRebootRequest={canManageWalls ? handleWallRebootRequest : undefined}
            onWallUnbindRequest={canManageWalls ? handleWallUnbindRequest : undefined}
            onControllerTokenRequest={canManageWalls ? handleControllerTokenRequest : undefined}
            presetWallId={presetWallId}
        />
    );
}
