import { queryOptions } from '@tanstack/react-query';

import type { SerializedAuditLog, SerializedCommit, SerializedCommitWithContent } from './projects';
import {
    $getAuditLogs,
    $getCommit,
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

export const commitQueryOptions = (commitId: string) =>
    queryOptions({
        queryKey: ['commits', commitId],
        queryFn: () =>
            $getCommit({ data: { id: commitId } }) as Promise<SerializedCommitWithContent>
    });
