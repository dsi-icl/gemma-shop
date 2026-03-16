import { createFileRoute, redirect } from '@tanstack/react-router';

import { $ensureMutableHead } from '~/server/projects.fns';
import { $getCommit } from '~/server/projects.fns';

export const Route = createFileRoute('/_auth/quarry/editor/$projectId/')({
    ssr: false,
    beforeLoad: async ({ params }) => {
        const headCommitId = await $ensureMutableHead({ data: { projectId: params.projectId } });
        const commit = await $getCommit({ data: { id: headCommitId } });
        const firstSlideId = commit?.content?.slides?.[0]?.id ?? 'default';

        throw redirect({
            to: '/quarry/editor/$projectId/$commitId/$slideId',
            params: {
                projectId: params.projectId,
                commitId: headCommitId,
                slideId: firstSlideId
            }
        });
    }
});
