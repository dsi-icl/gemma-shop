import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ResizablePanel } from '@repo/ui/components/resizable';

import { Layer } from '../types';
import { SortableLayerItem } from './SortableLayerItem';

interface LayerListProps {
    layers: Layer[];
}

export function LayerList({ layers }: LayerListProps) {
    return (
        <ResizablePanel defaultSize={50} minSize={20}>
            <div className="flex h-full flex-col overflow-hidden bg-muted/30">
                <div className="flex h-12 items-center border-b border-border bg-muted/50 px-4">
                    <h2 className="text-sm font-semibold">Layers (Current Slide)</h2>
                </div>

                <div className="flex-1 space-y-1 overflow-y-auto p-2">
                    <SortableContext
                        items={layers.map((l) => l.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {layers.map((layer) => (
                            <SortableLayerItem key={layer.id} layer={layer} />
                        ))}
                    </SortableContext>
                </div>
            </div>
        </ResizablePanel>
    );
}
