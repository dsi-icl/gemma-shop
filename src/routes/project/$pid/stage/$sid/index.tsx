import { createFileRoute } from '@tanstack/react-router';

import StageEditor from '@/components/StageEditor';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

export const Route = createFileRoute('/project/$pid/stage/$sid/')({
    component: RouteComponent
});

function RouteComponent() {
    return (
        <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
            <ResizablePanel defaultSize="75%">
                <StageEditor />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="20%">
                <div className="flex h-full items-center justify-center p-6">
                    <span className="font-semibold">Sidebar</span>
                </div>
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}
