import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_auth/quarry/projects')({
    component: AppLayout
});

function AppLayout() {
    return (
        <div className="h-full w-full">
            <Outlet />
        </div>
    );
}
