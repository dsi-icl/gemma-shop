import { DateDisplay } from '@repo/ui/components/date-display';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { adminProjectsQueryOptions } from '~/server/admin.queries';

export const Route = createFileRoute('/admin/projects')({
    loader: ({ context }) => {
        context.queryClient.ensureQueryData(adminProjectsQueryOptions());
    },
    component: AdminProjects,
    head: () => ({
        meta: [{ title: 'Projects · Admin · GemmaShop' }]
    })
});

function AdminProjects() {
    const { data: projects = [] } = useSuspenseQuery(adminProjectsQueryOptions());

    return (
        <div>
            <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium">Name</th>
                            <th className="px-4 py-3 text-left font-medium">Owner</th>
                            <th className="px-4 py-3 text-left font-medium">Created</th>
                            <th className="px-4 py-3 text-left font-medium">Updated</th>
                            <th className="px-4 py-3 text-left font-medium">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {projects.map((project: any) => (
                            <tr key={project.id} className="hover:bg-muted/30">
                                <td className="px-4 py-3 font-medium">{project.name}</td>
                                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                    {project.createdBy}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                    <DateDisplay value={project.createdAt} />
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                    <DateDisplay value={project.updatedAt} />
                                </td>
                                <td className="px-4 py-3">
                                    {project.deletedAt ? (
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
