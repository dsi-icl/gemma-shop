import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DotsSixVerticalIcon, ImageIcon, TextTIcon } from '@phosphor-icons/react';
import React from 'react';

import { Layer, LayerType } from '../types';

interface SortableLayerItemProps {
    layer: Layer;
}

export function SortableLayerItem({ layer }: SortableLayerItemProps) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
        id: layer.id,
        data: { type: 'layer' }
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition
    };

    const getLayerIcon = (type: LayerType): React.ReactNode => {
        return type === 'text' ? (
            <TextTIcon size={16} weight="bold" />
        ) : (
            <ImageIcon size={16} weight="bold" />
        );
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            className="flex cursor-grab items-center rounded-md border border-border bg-card p-2 shadow-sm transition-colors hover:border-primary"
        >
            <div {...listeners} className="mr-2 text-muted-foreground">
                <DotsSixVerticalIcon size={20} weight="bold" />
            </div>
            <div className="mr-2 rounded bg-muted p-1.5 text-muted-foreground">
                {getLayerIcon(layer.type)}
            </div>
            <div className="flex-1 truncate text-sm text-foreground">{layer.name}</div>
        </div>
    );
}
