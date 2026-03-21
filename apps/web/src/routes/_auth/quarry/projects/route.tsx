import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_auth/quarry/projects')({
    component: AppLayout
});

function AppLayout() {
    return (
        <div className="container flex min-h-svh min-w-full flex-col py-18">
            <div className="h-full w-full py-5">
                <div className="mx-auto w-full max-w-6xl">
                    <Outlet />
                </div>
            </div>
        </div>
    );
}
