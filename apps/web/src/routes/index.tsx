import { authQueryOptions } from '@repo/auth/tanstack/queries';
import { Button } from '@repo/ui/components/button';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';

import { publishedProjectsQueryOptions } from '~/server/projects.queries';

export const Route = createFileRoute('/')({
    component: HomePage,
    beforeLoad: async ({ context, search }) => {
        const { w } = search as { w?: string };
        if (w) {
            const user = await context.queryClient.ensureQueryData(authQueryOptions());
            if (!user) {
                throw redirect({ to: '/gallery', search: { w } });
            }
        }
    },
    loader: ({ context }) => {
        context.queryClient.ensureQueryData(publishedProjectsQueryOptions());
    }
});

function HomePage() {
    return (
        <div className="container mx-auto h-full min-h-full p-4 pt-24">
            <div className="flex h-full flex-col items-center justify-center gap-8 align-middle">
                <Link to="/gallery">
                    <Button>Gallery</Button>
                </Link>
                <Link to="/quarry">
                    <Button>Projects</Button>
                </Link>
            </div>
        </div>
    );
}
