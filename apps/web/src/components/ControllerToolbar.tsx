import { Separator } from '@repo/ui/components/separator';
import { TooltipProvider } from '@repo/ui/components/tooltip';

import { AppearanceToolbar } from '~/components/AppearanceToolbar';
import { ControllerEngine } from '~/lib/controllerEngine';

export function ControllerToolbar() {
    // const engine = ControllerEngine.getInstance();

    return (
        <TooltipProvider>
            <div
                id="toolbar"
                className="flex h-11 min-h-11 items-center gap-1 border-t border-b border-border bg-card/50 px-2 py-1"
            >
                <AppearanceToolbar />
                <Separator orientation="vertical" className="mx-1 h-6" />
                {/* TODO Add video controls here */}
                {/* <PlaybackControls
                            key={`pc_${activeLayer.numericId}`}
                            layer={activeLayer as Extract<LayerWithEditorState, { type: 'video' }>}
                            engine={engine}
                        />
                        <Separator orientation="vertical" className="mx-1 h-6" />
                        <VideoScrubber
                            key={`vs_${activeLayer.numericId}`}
                            layer={activeLayer as Extract<LayerWithEditorState, { type: 'video' }>}
                            engine={engine}
                        /> */}
            </div>
        </TooltipProvider>
    );
}
