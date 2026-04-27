import { authQueryOptions } from '@repo/auth/tanstack/queries';
import { Button } from '@repo/ui/components/button';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';

import {
    $getCustomControllerHtml,
    $upsertCustomControllerHtml
} from '~/server/customController.fns';

export const Route = createFileRoute('/_auth/quarry/projects/$projectId/controller_editor')({
    component: ControllerEditor,
    loader: async ({ context }) => {
        const user = await context.queryClient.ensureQueryData(authQueryOptions());
        if (user?.role !== 'admin') {
            throw new Response('Unauthorized', { status: 401 });
        }
    }
});

function ControllerEditor() {
    const { projectId } = Route.useParams();
    const queryClient = useQueryClient();

    const { data: initialHtml } = useSuspenseQuery({
        queryKey: ['controllerHtml', projectId],
        queryFn: () => $getCustomControllerHtml({ data: { projectId } })
    });

    const [html, setHtml] = useState(initialHtml ?? '');

    const mutation = useMutation({
        mutationFn: () => $upsertCustomControllerHtml({ data: { projectId, html } }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['controllerHtml', projectId] });
            toast.success('Controller HTML saved successfully');
        },
        onError: (e) => toast.error(e.message)
    });

    return (
        <div className="flex flex-col gap-6">
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                Save
            </Button>
            <textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                className="h-[50vh] w-full rounded border border-border bg-background p-3 font-mono text-sm"
            />
        </div>
    );
}
