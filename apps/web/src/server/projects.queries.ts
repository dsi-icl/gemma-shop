import { queryOptions } from '@tanstack/react-query';

import type { SerializedAuditLog, SerializedCommit } from './projects';
import {
    $getAuditLogs,
    $getProject,
    $getProjectCommits,
    $listAssets,
    $listProjects,
    $listPublishedProjects
} from './projects.fns';

export const projectsQueryOptions = (includeArchived = false) =>
    queryOptions({
        queryKey: ['projects', { includeArchived }],
        queryFn: () => $listProjects({ data: { includeArchived } })
    });

export const projectAssetsQueryOptions = (projectId: string) =>
    queryOptions({
        queryKey: ['projects', projectId, 'assets'],
        queryFn: () => $listAssets({ data: { projectId } })
    });

export const projectQueryOptions = (id: string) =>
    queryOptions({
        queryKey: ['projects', id],
        queryFn: () => $getProject({ data: { id } })
    });

export const publishedProjectsQueryOptions = () =>
    queryOptions({
        queryKey: ['projects', 'published'],
        queryFn: () => $listPublishedProjects()
    });

export const auditLogsQueryOptions = (projectId: string) =>
    queryOptions({
        queryKey: ['projects', projectId, 'audit'],
        queryFn: () => $getAuditLogs({ data: { projectId } }) as Promise<SerializedAuditLog[]>
    });

export const commitsQueryOptions = (projectId: string) =>
    queryOptions({
        queryKey: ['projects', projectId, 'commits'],
        queryFn: () => $getProjectCommits({ data: { projectId } }) as Promise<SerializedCommit[]>
    });
