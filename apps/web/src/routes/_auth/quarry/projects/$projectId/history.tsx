import { ClockIcon } from '@phosphor-icons/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { toLocalDateTimeString } from '~/lib/safeDate';
import { auditLogsQueryOptions, projectQueryOptions } from '~/server/projects.queries';

export const Route = createFileRoute('/_auth/quarry/projects/$projectId/history')({
    loader: async ({ context, params }) => {
        context.queryClient.ensureQueryData(auditLogsQueryOptions(params.projectId));
        const project = await context.queryClient.ensureQueryData(
            projectQueryOptions(params.projectId)
        );
        return {
            projectName: project?.name ?? 'Project'
        };
    },
    component: HistoryTab,
    head: ({ loaderData }) => ({
        meta: [{ title: `History · ${loaderData?.projectName ?? 'Project'} · GemmaShop` }]
    })
});

function HistoryTab() {
    const { projectId } = Route.useParams();
    const { data: logs } = useSuspenseQuery(auditLogsQueryOptions(projectId));

    if (logs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-12 text-muted-foreground">
                <p>No history yet</p>
                <p className="text-xs">Changes to this project will be logged here.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="space-y-3">
                {logs.map((log) => (
                    <div
                        key={log.id}
                        className="flex items-start gap-3 rounded-xl border p-4 text-sm"
                    >
                        <ClockIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div className="flex-1">
                            <div className="flex items-center justify-between">
                                <span className="font-medium">{log.action.replace(/_/g, ' ')}</span>
                                <span className="text-xs text-muted-foreground">
                                    {toLocalDateTimeString(log.createdAt)}
                                </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                by {typeof log.actorId === 'string' ? log.actorId : 'Unknown'}
                            </p>
                            {log.changes && (
                                <pre className="mt-2 max-h-24 overflow-auto rounded-lg bg-muted/50 p-2 text-xs">
                                    {JSON.stringify(log.changes, null, 2)}
                                </pre>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
