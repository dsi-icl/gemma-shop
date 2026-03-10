import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup
} from '@repo/ui/components/resizable';
import { createFileRoute } from '@tanstack/react-router';

import { LayerList } from '~/components/LayerList';
import { MainBoard } from '~/components/MainBoard';
import { SlideList } from '~/components/SlideList';

export const Route = createFileRoute('/_auth/quarry/editor/$projectId/$slideId')({
    component: SlideEditor
});

function SlideEditor() {
    return (
        <ResizablePanelGroup
            orientation="horizontal"
            className="grow overflow-hidden font-sans text-foreground"
        >
            <ResizablePanel>
                <MainBoard />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={400} minSize={200}>
                <ResizablePanelGroup orientation="vertical" className="h-full bg-card/50">
                    <ResizablePanel defaultSize={80}>
                        <SlideList />
                    </ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel>
                        <LayerList />
                    </ResizablePanel>
                </ResizablePanelGroup>
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}
