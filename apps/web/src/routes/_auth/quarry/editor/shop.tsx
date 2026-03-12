import { createFileRoute } from '@tanstack/react-router';

import StageEditor from '~/components/StageEditor';
import { StageSidebar } from '~/components/StageSidebar';
export const Route = createFileRoute('/_auth/quarry/editor/shop')({
    component: RouteComponent
});

function RouteComponent() {
    return (
        <>
            <StageEditor />
            <StageSidebar />
        </>
    );
}
