import { ResizablePanel } from '@repo/ui/components/resizable';

import { useEditorStore } from '~/lib/editorStore';

import { DraggableList } from './DraggableList';
import { LayerItem } from './LayerItem';

export function LayerList() {
    const layers = useEditorStore((s) => s.layers);
    const selectedLayerIds = useEditorStore((s) => s.selectedLayerIds);
    const reorderLayers = useEditorStore((s) => s.reorderLayers);
    const toggleLayerSelection = useEditorStore((s) => s.toggleLayerSelection);

    const sortedLayers = [...layers].sort((a, b) => b.config.zIndex - a.config.zIndex);

    return (
        <ResizablePanel defaultSize={50} minSize={20}>
            <div className="flex h-full flex-col overflow-hidden bg-muted/30">
                <div className="flex h-12 items-center border-b border-border bg-muted/50 px-4">
                    <h2 className="text-sm font-semibold">Layers (Current Slide)</h2>
                </div>

                <div className="flex-1 space-y-1 overflow-y-auto p-2">
                    <DraggableList
                        items={sortedLayers.map((layer) => ({
                            ...layer,
                            id: layer.numericId.toString()
                        }))}
                        selectedIds={selectedLayerIds}
                        onReorder={(reorderedItems) => {
                            const newLayers = reorderedItems.map((item) => {
                                const existingLayer = layers.find(
                                    (l) => l.numericId.toString() === item.id
                                );
                                if (!existingLayer) {
                                    throw new Error('Could not find existing layer');
                                }
                                return existingLayer;
                            });
                            reorderLayers(newLayers.reverse());
                        }}
                        onSelect={toggleLayerSelection}
                        itemRenderer={(layer, { isSelected }) => (
                            <LayerItem layer={layer} isSelected={isSelected} />
                        )}
                        overlayRenderer={(layer) => (
                            <LayerItem
                                layer={layer}
                                isSelected={selectedLayerIds.includes(layer.id)}
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
