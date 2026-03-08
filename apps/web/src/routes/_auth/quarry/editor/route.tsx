import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_auth/quarry/editor')({
    component: AppLayout
});

function AppLayout() {
    return (
        <div className="container flex min-h-svh min-w-full flex-col py-18">
            <Outlet />
        </div>
    );
}
