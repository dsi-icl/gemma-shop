import { ImageIcon, TextTIcon } from '@phosphor-icons/react';
import React from 'react';

import { Layer, LayerType } from '../types';

interface LayerItemProps {
    layer: Layer;
    isSelected: boolean;
}

export function LayerItem({ layer, isSelected }: LayerItemProps) {
    const getLayerIcon = (type: LayerType): React.ReactNode => {
        return type === 'text' ? (
            <TextTIcon size={16} weight="bold" />
        ) : (
            <ImageIcon size={16} weight="bold" />
        );
    };

    return (
        <div
            className={`flex items-center rounded-md border p-2 shadow-sm transition-colors ${
                isSelected
                    ? 'border-ring bg-accent text-accent-foreground'
                    : 'border-border bg-card hover:border-primary'
            }`}
        >
            <div className="mr-2 rounded bg-muted p-1.5 text-muted-foreground">
                {getLayerIcon(layer.type)}
            </div>
            <div className="flex-1 truncate text-sm text-foreground">{layer.name}</div>
        </div>
    );
}
