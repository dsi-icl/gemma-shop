import { createFileRoute, redirect } from '@tanstack/react-router';

import { $ensureMutableHead } from '~/server/projects.fns';

export const Route = createFileRoute('/_auth/quarry/editor/$projectId/$slideId')({
    ssr: false,
    beforeLoad: async ({ params }) => {
        const headCommitId = await $ensureMutableHead({ data: { projectId: params.projectId } });
        throw redirect({
            to: '/quarry/editor/$projectId/$commitId/$slideId',
            params: {
                projectId: params.projectId,
                commitId: headCommitId,
                slideId: params.slideId
            }
        });
    }
});
