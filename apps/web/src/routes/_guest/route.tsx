import { authQueryOptions } from '@repo/auth/tanstack/queries';
import { Clock } from '@repo/ui/components/clock';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { KeyboardToggle } from '~/components/keyboard-toggle';
import { ThemeToggle } from '~/components/theme-toggle';

export const Route = createFileRoute('/_guest')({
    component: RouteComponent,
    beforeLoad: async ({ context }) => {
        const REDIRECT_URL = '/app';

        const user = await context.queryClient.ensureQueryData({
            ...authQueryOptions(),
            revalidateIfStale: true
        });
        if (user) {
            throw redirect({
                to: REDIRECT_URL
            });
        }

        return {
            redirectUrl: REDIRECT_URL
        };
    }
});

function RouteComponent() {
    return (
        <div className="flex min-h-svh flex-col bg-background">
            <GuestHeader />
            <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 md:p-10">
                <div className="w-full max-w-sm">
                    <Outlet />
                </div>
            </div>
        </div>
    );
}

function GuestHeader() {
    return (
        <header className="flex items-center justify-end gap-2 p-4">
            <div className="grow">
                <Clock />
            </div>
            <KeyboardToggle />
            <ThemeToggle />
        </header>
    );
}
