import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_auth/quarry/editor')({
    component: AppLayout
});

function AppLayout() {
    return (
        <div className="container flex h-full max-h-full min-h-0 w-full max-w-full min-w-full flex-col overflow-hidden pt-18 pb-13">
            <Outlet />
        </div>
    );
}
