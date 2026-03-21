import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { toast } from 'sonner';

import { ProjectForm } from '~/components/ProjectForm';
import { $updateProject } from '~/server/projects.fns';
import { projectQueryOptions } from '~/server/projects.queries';

export const Route = createFileRoute('/_auth/quarry/projects/$projectId/')({
    component: InfoTab
});

function InfoTab() {
    const { projectId } = Route.useParams();
    const queryClient = useQueryClient();
    const { data: project } = useSuspenseQuery(projectQueryOptions(projectId));

    const mutation = useMutation({
        mutationFn: (data: Parameters<typeof $updateProject>[0]['data']) =>
            $updateProject({ data }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        },
        onError: (e) => toast.error(e.message)
    });

    return (
        <ProjectForm
            defaultValues={{
                name: project.name,
                authorOrganisation: project.authorOrganisation,
                description: project.description,
                tags: project.tags.filter((t) => t !== 'public'),
                heroImages: project.heroImages,
                collaborators: project.collaborators
            }}
            onSubmit={(data) => mutation.mutate({ ...data, _id: projectId })}
            isSubmitting={mutation.isPending}
            submitLabel="Save changes"
            autoSave
            autoSaveDelayMs={1200}
        />
    );
}
