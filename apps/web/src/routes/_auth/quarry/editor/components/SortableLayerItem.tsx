import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    DotsSixVerticalIcon,
    ImageIcon,
    TextTIcon,
} from '@phosphor-icons/react';
import React from 'react';
import { useEditor } from '../contexts/EditorContext';
import { Layer, LayerType } from '../types';

interface SortableLayerItemProps {
    layer: Layer;
}

export function SortableLayerItem({ layer }: SortableLayerItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: layer.id, data: { type: 'layer' } });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };
    
    const { selectedLayers, toggleLayerSelection } = useEditor();
    const isSelected = selectedLayers.includes(layer.id);

    const getLayerIcon = (type: LayerType): React.ReactNode => {
        return type === 'text' ? (
            <TextTIcon size={16} weight="bold" />
        ) : (
            <ImageIcon size={16} weight="bold" />
        );
    };

    const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        toggleLayerSelection(layer.id, e.shiftKey, e.ctrlKey);
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            onMouseUp={handleMouseUp}
            className={`flex cursor-grab items-center rounded-md border p-2 shadow-sm transition-colors ${
                isSelected
                ? 'border-blue-500 bg-blue-100 dark:bg-blue-900'
                : 'border-border bg-card hover:border-primary'
            }`}
        >
            <div {...listeners} className="mr-2 text-muted-foreground">
                <DotsSixVerticalIcon size={20} weight="bold" />
            </div>
            <div className="mr-2 rounded bg-muted p-1.5 text-muted-foreground">
                {getLayerIcon(layer.type)}
            </div>
            <div className="flex-1 truncate text-sm text-foreground">
                {layer.name}
            </div>
        </div>
    );
}
