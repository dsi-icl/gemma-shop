import { DotsSixVerticalIcon, ImageIcon, TextTIcon } from '@phosphor-icons/react';
import React from 'react';

import { Layer, LayerType } from '../types';

interface LayerItemProps {
    layer: Layer;
    isSelected: boolean;
    listeners?: any;
}

export function LayerItem({ layer, isSelected, listeners }: LayerItemProps) {
    const getLayerIcon = (type: LayerType): React.ReactNode => {
        return type === 'text' ? (
            <TextTIcon size={16} weight="bold" />
        ) : (
            <ImageIcon size={16} weight="bold" />
        );
    };

    return (
        <div
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
            <div className="flex-1 truncate text-sm text-foreground">{layer.name}</div>
        </div>
    );
}
