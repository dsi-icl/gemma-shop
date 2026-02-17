import { createFileRoute } from '@tanstack/react-router';

import StageEditor from '@/components/StageEditor';
import { StageSidebar } from '@/components/StageSidebar';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

export const Route = createFileRoute('/project/$pid/stage/$sid/')({
    component: RouteComponent
});

function RouteComponent() {
    return (
        <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
            <ResizablePanel>
                <StageEditor />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="25%">
                <StageSidebar />
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}
