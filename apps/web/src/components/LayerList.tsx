import { ResizablePanel } from '@repo/ui/components/resizable';

import { useEditor } from '../contexts/EditorContext';
import { DraggableList } from './DraggableList';
import { LayerItem } from './LayerItem';

export function LayerList() {
    const { layers, setLayers, selectedLayers, toggleLayerSelection } = useEditor();

    return (
        <ResizablePanel defaultSize={50} minSize={20}>
            <div className="flex h-full flex-col overflow-hidden bg-muted/30">
                <div className="flex h-12 items-center border-b border-border bg-muted/50 px-4">
                    <h2 className="text-sm font-semibold">Layers (Current Slide)</h2>
                </div>

                <div className="flex-1 space-y-1 overflow-y-auto p-2">
                    <DraggableList
                        items={layers}
                        selectedIds={selectedLayers}
                        onReorder={setLayers}
                        onSelect={toggleLayerSelection}
                        itemRenderer={(layer, { isSelected }) => (
                            <LayerItem layer={layer} isSelected={isSelected} />
                        )}
                        overlayRenderer={(layer) => (
                            <LayerItem
                                layer={layer}
                                isSelected={selectedLayers.includes(layer.id)}
                            />
                        )}
                        multiDragLabel={(count) => (
                            <div className="rounded-md border border-border bg-card p-2 text-primary shadow-lg">
                                {count} layers
                            </div>
                        )}
                    />
                </div>
            </div>
        </ResizablePanel>
    );
}
