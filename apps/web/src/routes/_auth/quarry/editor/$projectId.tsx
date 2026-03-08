import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup
} from '@repo/ui/components/resizable';
import { createFileRoute } from '@tanstack/react-router';

import { LayerList } from './components/LayerList';
import { MainBoard } from './components/MainBoard';
import { SlideList } from './components/SlideList';
import { EditorProvider } from './contexts/EditorContext';

export const Route = createFileRoute('/_auth/quarry/editor/$projectId')({
    component: PresentationEditor
});

function PresentationEditor() {
    return (
        <EditorProvider>
            <EditorContent />
        </EditorProvider>
    );
}

function EditorContent() {
    return (
        <ResizablePanelGroup
            orientation="horizontal"
            className="grow overflow-hidden font-sans text-foreground"
        >
            <MainBoard />
            <ResizableHandle />
            <ResizablePanel defaultSize={400} minSize={200}>
                <ResizablePanelGroup orientation="vertical" className="h-full bg-card/50">
                    <SlideList />
                    <ResizableHandle withHandle />
                    <LayerList />
                </ResizablePanelGroup>
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}
