import { ArrowLeftIcon } from '@phosphor-icons/react';
import { Button } from '@repo/ui/components/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';

import { ProjectForm } from '~/components/ProjectForm';
import { $createProject } from '~/server/projects.fns';

export const Route = createFileRoute('/_auth/quarry/projects/new')({
    component: NewProject
});

function NewProject() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: (data: Parameters<typeof $createProject>[0]['data']) =>
            $createProject({ data }),
        onSuccess: (project) => {
            toast.success('Project created');
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            navigate({
                to: '/quarry/projects/$projectId',
                params: { projectId: project._id }
            });
        },
        onError: (e) => toast.error(e.message)
    });

    return (
        <div className="flex h-full flex-col overflow-hidden pt-14 pb-14">
            <div className="mx-auto w-full max-w-6xl shrink-0 px-6 pt-4">
                <div className="mb-6 flex items-center gap-3">
                    <Button
                        render={<Link to="/quarry" />}
                        variant="ghost"
                        size="icon-sm"
                        nativeButton={false}
                        className="w-5 justify-start"
                    >
                        <ArrowLeftIcon />
                    </Button>
                    <div className="flex-1">
                        <h2 className="text-xl font-semibold">Create New Project</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Define project metadata and visibility before publishing.
                        </p>
                    </div>
                    <Button
                        render={<Link to="/quarry" />}
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                    >
                        Cancel
                    </Button>
                </div>
            </div>

            <div className="relative mx-auto min-h-0 w-full max-w-6xl flex-1">
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-linear-to-b from-background to-transparent" />
                <div className="scrollbar-none h-full overflow-y-auto px-6 pt-2 pb-6">
                    <ProjectForm
                        onSubmit={(data) => mutation.mutate(data)}
                        isSubmitting={mutation.isPending}
                    />
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-linear-to-t from-background to-transparent" />
            </div>
        </div>
    );
}
