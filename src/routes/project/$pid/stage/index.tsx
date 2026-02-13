import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/project/$pid/stage/')({
    component: RouteComponent
});

function RouteComponent() {
    return <div>Hello "/project/$pid/stage/"!</div>;
}
