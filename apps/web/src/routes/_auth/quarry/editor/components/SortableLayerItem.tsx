import { useDndContext } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React from 'react';

import { useEditor } from '../contexts/EditorContext';
import { Layer } from '../types';
import { LayerItem } from './LayerItem';

interface SortableLayerItemProps {
    layer: Layer;
}

export function SortableLayerItem({ layer }: SortableLayerItemProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: layer.id,
        data: { type: 'layer' }
    });

    const { active } = useDndContext();

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1
    };

    const { selectedLayers, toggleLayerSelection } = useEditor();
    const isSelected = selectedLayers.includes(layer.id);

    const isAnotherSelectedDragging =
        active && active.id !== layer.id && selectedLayers.includes(active.id as string);

    if (isAnotherSelectedDragging && isSelected) {
        return null;
    }

    const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        toggleLayerSelection(layer.id, e.shiftKey, e.ctrlKey);
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} onMouseUp={handleMouseUp}>
            <LayerItem layer={layer} isSelected={isSelected} listeners={listeners} />
        </div>
    );
}
