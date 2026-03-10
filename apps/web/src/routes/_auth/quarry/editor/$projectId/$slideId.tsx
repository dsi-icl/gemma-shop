import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup
} from '@repo/ui/components/resizable';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { usePanelRef } from 'react-resizable-panels';

import { LayerList } from '~/components/LayerList';
import { MainBoard } from '~/components/MainBoard';
import { SlideList } from '~/components/SlideList';

export const Route = createFileRoute('/_auth/quarry/editor/$projectId/$slideId')({
    component: SlideEditor
});

function SlideEditor() {
    const [hasInitialised, setHasInitialised] = useState(false);
    const slidePanelRef = usePanelRef();
    const layerPanelRef = usePanelRef();
    const [slidesCollapsed, setSlidesCollapsed] = useState(true);
    const [layersCollapsed, setLayersCollapsed] = useState(false);
    const titleBarSize = 40;

    useEffect(() => {
        if (hasInitialised) return;
        if (slidesCollapsed && slidePanelRef.current) {
            slidePanelRef.current.collapse();
            setHasInitialised(true);
        }
    }, [hasInitialised, slidesCollapsed, slidePanelRef]);

    return (
        <ResizablePanelGroup
            orientation="horizontal"
            className="grow overflow-hidden font-sans text-foreground"
        >
            <ResizablePanel>
                <MainBoard />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={300} minSize={200}>
                <ResizablePanelGroup orientation="vertical" className="h-full bg-card/50">
                    <ResizablePanel
                        collapsible
                        collapsedSize={titleBarSize}
                        minSize={titleBarSize}
                        panelRef={slidePanelRef}
                        onResize={({ inPixels }) => setSlidesCollapsed(inPixels <= titleBarSize)}
                    >
                        <SlideList
                            titleBarSize={titleBarSize}
                            collapsed={slidesCollapsed}
                            onCollapse={() => slidePanelRef.current?.collapse()}
                            onExpand={() => slidePanelRef.current?.expand()}
                        />
                    </ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel
                        collapsible
                        collapsedSize={titleBarSize}
                        minSize={titleBarSize}
                        panelRef={layerPanelRef}
                        onResize={({ inPixels }) => setLayersCollapsed(inPixels <= titleBarSize)}
                    >
                        <LayerList
                            titleBarSize={titleBarSize}
                            collapsed={layersCollapsed}
                            onCollapse={() => layerPanelRef.current?.collapse()}
                            onExpand={() => layerPanelRef.current?.expand()}
                        />
                    </ResizablePanel>
                </ResizablePanelGroup>
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}
