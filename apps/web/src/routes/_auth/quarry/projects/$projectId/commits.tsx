import { GlobeIcon, GlobeXIcon } from '@phosphor-icons/react';
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
import { createFileRoute } from '@tanstack/react-router';
import { toast } from 'sonner';

import { $publishCommit } from '~/server/projects.fns';
import { commitsQueryOptions, projectQueryOptions } from '~/server/projects.queries';

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
                            <TableHead>Message</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-20" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {commits.map((commit) => {
                            const isPublished = commit._id === project.publishedCommitId;
                            return (
                                <TableRow key={commit._id}>
                                    <TableCell className="font-medium">{commit.message}</TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {commit.updatedAt
                                            ? new Date(commit.updatedAt).toLocaleString()
                                            : new Date(commit.createdAt).toLocaleString()}
                                    </TableCell>
                                    <TableCell>
                                        {isPublished && (
                                            <Badge variant="default" className="text-xs">
                                                Published
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
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
