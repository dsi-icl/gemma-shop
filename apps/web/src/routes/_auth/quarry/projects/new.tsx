import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';

import { ProjectForm } from '~/components/project-form';
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
        <div className="mx-auto w-full max-w-2xl">
            <h2 className="mb-6 text-xl font-semibold">Create New Project</h2>
            <ProjectForm
                onSubmit={(data) => mutation.mutate(data)}
                isSubmitting={mutation.isPending}
            />
        </div>
    );
}
