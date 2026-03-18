import {
    ArrowUpIcon,
    EyeIcon,
    GitBranchIcon,
    GlobeIcon,
    GlobeXIcon,
    PencilSimpleIcon
} from '@phosphor-icons/react';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@repo/ui/components/table';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { format, formatDistanceToNow, isBefore, subMonths, differenceInDays } from 'date-fns';
import { useMemo } from 'react';
import { toast } from 'sonner';

import type { SerializedCommit } from '~/server/projects';
import { $promoteBranchHead, $publishCommit } from '~/server/projects.fns';
import { commitsQueryOptions, projectQueryOptions } from '~/server/projects.queries';

/**
 * Sort commits topologically by walking the parentId chain from HEAD,
 * then from any other branch heads. Project HEAD branch comes first.
 */
function topoSort(commits: SerializedCommit[], headCommitId: string | null): SerializedCommit[] {
    if (commits.length === 0) return [];
    const byId = new Map(commits.map((c) => [c._id, c]));
    const sorted: SerializedCommit[] = [];
    const visited = new Set<string>();

    // Walk a chain from a starting commit
    const walkChain = (start: SerializedCommit | undefined) => {
        let current = start;
        while (current && !visited.has(current._id)) {
            visited.add(current._id);
            sorted.push(current);
            current = current.parentId ? byId.get(current.parentId) : undefined;
        }
    };

    // 1. Walk from the project HEAD first
    const projectHead = headCommitId ? byId.get(headCommitId) : undefined;
    walkChain(projectHead);

    // 2. Walk from other mutable branch heads
    for (const c of commits) {
        if (c.isMutableHead && !visited.has(c._id)) {
            walkChain(c);
        }
    }

    // 3. Append any orphan commits not reachable from any head
    for (const c of commits) {
        if (!visited.has(c._id)) sorted.push(c);
    }

    return sorted;
}

/** Graph node for a single commit row */
function CommitGraphNode({
    isFirst,
    isLast,
    isMutableHead,
    isPublished
}: {
    isFirst: boolean;
    isLast: boolean;
    isMutableHead: boolean;
    isPublished: boolean;
}) {
    const cx = 12;
    const r = isMutableHead ? 5 : 4;
    return (
        <svg width={24} height="100%" className="min-h-10" aria-hidden>
            {/* Line above */}
            {!isFirst && (
                <line
                    x1={cx}
                    y1={0}
                    x2={cx}
                    y2="50%"
                    className="stroke-muted-foreground/40"
                    strokeWidth={2}
                />
            )}
            {/* Line below */}
            {!isLast && (
                <line
                    x1={cx}
                    y1="50%"
                    x2={cx}
                    y2="100%"
                    className="stroke-muted-foreground/40"
                    strokeWidth={2}
                />
            )}
            {/* Node circle */}
            <circle
                cx={cx}
                cy="50%"
                r={r}
                className={
                    isMutableHead
                        ? 'fill-primary stroke-primary'
                        : isPublished
                          ? 'fill-green-500 stroke-green-500'
                          : 'fill-muted-foreground/60 stroke-muted-foreground/60'
                }
                strokeWidth={isMutableHead ? 2 : 1.5}
            />
        </svg>
    );
}

export const Route = createFileRoute('/_auth/quarry/projects/$projectId/commits')({
    component: CommitsTab,
    loader: ({ context, params }) => {
        context.queryClient.ensureQueryData(commitsQueryOptions(params.projectId));
    }
});

function CommitsTab() {
    const { projectId } = Route.useParams();
    const { data: project } = useSuspenseQuery(projectQueryOptions(projectId));
    const { data: commits } = useSuspenseQuery(commitsQueryOptions(projectId));
    const queryClient = useQueryClient();

    const publishMutation = useMutation({
        mutationFn: (commitId: string | null) => $publishCommit({ data: { projectId, commitId } }),
        onSuccess: (isPublished) => {
            toast.success(isPublished ? 'Commit published' : 'Project unpublished');
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        },
        onError: (e) => toast.error(e.message)
    });

    const promoteMutation = useMutation({
        mutationFn: (branchCommitId: string) =>
            $promoteBranchHead({ data: { projectId, branchCommitId } }),
        onSuccess: () => {
            toast.success('Branch promoted to project HEAD');
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        },
        onError: (e) => toast.error(e.message)
    });

    const formatRelativeDate = (date: Date): string => {
        const now = new Date();
        const oneMonthAgo = subMonths(now, 1);

        if (isBefore(date, oneMonthAgo)) {
            return format(date, 'd MMM yyyy, HH:mm');
        }

        const daysDifference = differenceInDays(now, date);

        if (daysDifference >= 7) {
            const weeksDifference = Math.round(daysDifference / 7);
            if (weeksDifference === 1) {
                return `a week ago`;
            }
            return `${weeksDifference} weeks ago`;
        }

        if (daysDifference > 0) {
            const distance = formatDistanceToNow(date, { addSuffix: true });
            return `${distance} at ${format(date, 'HH:mm')}`;
        }

        // It's today
        return formatDistanceToNow(date, { addSuffix: true });
    };

    const sorted = useMemo(
        () => topoSort(commits, project.headCommitId ?? null),
        [commits, project.headCommitId]
    );

    if (commits.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-12 text-muted-foreground">
                <p>No commits yet</p>
                <p className="text-xs">Commits will appear here as changes are saved.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div>
                <h3 className="mb-1 text-base font-medium">Commit History</h3>
                <p className="text-sm text-muted-foreground">
                    Select a commit to publish it to the public gallery.
                </p>
            </div>

            <div className="overflow-hidden rounded-2xl border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-6 px-0" />
                            <TableHead>Message</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sorted.map((commit, idx) => {
                            const isPublished = commit._id === project.publishedCommitId;
                            let displayDate = '-';
                            try {
                                const commitDate = new Date(commit.updatedAt ?? commit.createdAt);
                                displayDate = formatRelativeDate(commitDate);
                            } catch (_e) {}
                            return (
                                <TableRow key={commit._id}>
                                    <TableCell className="h-12 w-6 px-0 py-0!">
                                        <CommitGraphNode
                                            isFirst={idx === 0}
                                            isLast={idx === sorted.length - 1}
                                            isMutableHead={commit.isMutableHead}
                                            isPublished={isPublished}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium">{commit.message}</TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {displayDate}
                                    </TableCell>
                                    <TableCell>
                                        {isPublished && (
                                            <Badge variant="default" className="text-xs">
                                                Published
                                            </Badge>
                                        )}
                                        {commit.isMutableHead &&
                                            commit._id !== project.headCommitId && (
                                                <Badge variant="outline" className="text-xs">
                                                    <GitBranchIcon /> Branch
                                                </Badge>
                                            )}
                                    </TableCell>
                                    <TableCell className="flex items-center gap-1">
                                        <Button
                                            render={
                                                <Link
                                                    to="/quarry/view/$projectId/$commitId"
                                                    params={{
                                                        projectId,
                                                        commitId: commit._id
                                                    }}
                                                />
                                            }
                                            variant="outline"
                                            size="xs"
                                            nativeButton={false}
                                        >
                                            <EyeIcon /> View
                                        </Button>
                                        {commit.isMutableHead &&
                                            commit._id !== project.headCommitId && (
                                                <Button
                                                    variant="outline"
                                                    size="xs"
                                                    onClick={() =>
                                                        promoteMutation.mutate(commit._id)
                                                    }
                                                    disabled={promoteMutation.isPending}
                                                >
                                                    <ArrowUpIcon /> Promote
                                                </Button>
                                            )}
                                        {isPublished ? (
                                            <Button
                                                variant="outline"
                                                size="xs"
                                                onClick={() => publishMutation.mutate(null)}
                                                disabled={publishMutation.isPending}
                                            >
                                                <GlobeXIcon /> Unpublish
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="outline"
                                                size="xs"
                                                onClick={() => publishMutation.mutate(commit._id)}
                                                disabled={publishMutation.isPending}
                                            >
                                                <GlobeIcon /> Publish
                                            </Button>
                                        )}
                                        {commit.isMutableHead && commit.firstSlideId ? (
                                            <Button
                                                render={
                                                    <Link
                                                        to="/quarry/editor/$projectId/$commitId/$slideId"
                                                        params={{
                                                            projectId,
                                                            commitId: commit._id,
                                                            slideId: commit.firstSlideId
                                                        }}
                                                    />
                                                }
                                                variant="outline"
                                                size="xs"
                                                nativeButton={false}
                                            >
                                                <PencilSimpleIcon /> Edit
                                            </Button>
                                        ) : null}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
