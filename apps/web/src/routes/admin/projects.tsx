import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { formatDateValue } from '~/lib/safeDate';
import { adminProjectsQueryOptions } from '~/server/admin.queries';

export const Route = createFileRoute('/admin/projects')({
    component: AdminProjects,
    loader: ({ context }) => {
        context.queryClient.ensureQueryData(adminProjectsQueryOptions());
    }
});

function AdminProjects() {
    const { data: projects = [] } = useSuspenseQuery(adminProjectsQueryOptions());

    return (
        <div>
            <h1 className="mb-4 text-xl font-semibold">Projects</h1>
            <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium">Name</th>
                            <th className="px-4 py-3 text-left font-medium">Owner</th>
                            <th className="px-4 py-3 text-left font-medium">Created</th>
                            <th className="px-4 py-3 text-left font-medium">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {projects.map((project: any) => (
                            <tr key={project._id} className="hover:bg-muted/30">
                                <td className="px-4 py-3 font-medium">{project.name}</td>
                                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                    {project.createdBy}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                    {formatDateValue(project.createdAt, 'd MMM yyyy')}
                                </td>
                                <td className="px-4 py-3">
                                    {project.archived ? (
                                        <span className="text-xs text-muted-foreground">
                                            Archived
                                        </span>
                                    ) : (
                                        <span className="text-xs text-green-600 dark:text-green-400">
                                            Active
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
