import { createFileRoute } from '@tanstack/react-router';

import { publishedProjectsQueryOptions } from '~/server/projects.queries';

export const Route = createFileRoute('/')({
    component: HomePage,
    loader: ({ context }) => {
        context.queryClient.ensureQueryData(publishedProjectsQueryOptions());
    },
});

function HomePage() {
    return (
        <div className="container mx-auto p-4 pt-24">
            <div className="flex flex-col gap-8 md:flex-row"></div>
        </div>
    );
}
