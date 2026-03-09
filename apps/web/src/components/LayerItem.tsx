import { BugBeetle, FilmSlate, Image, MapTrifold, TextT, Graph } from '@phosphor-icons/react';
import React from 'react';

import { LayerWithEditorState } from '~/lib/types';

interface LayerItemProps {
    layer: LayerWithEditorState;
    isSelected: boolean;
}

export function LayerItem({ layer, isSelected }: LayerItemProps) {
    const getLayerIcon = (type: LayerWithEditorState['type']): React.ReactNode => {
        switch (type) {
            case 'text':
                return <TextT size={16} weight="bold" />;
            case 'image':
                return <Image size={16} weight="bold" />;
            case 'video':
                return <FilmSlate size={16} weight="bold" />;
            case 'graph':
                return <Graph size={16} weight="bold" />;
            case 'map':
                return <MapTrifold size={16} weight="bold" />;
            default:
                return <BugBeetle size={16} weight="bold" />;
        }
    };

    const getLayerName = (layer: LayerWithEditorState): string => {
        switch (layer.type) {
            case 'text':
                return layer.markdown.split('\n')[0] || 'Text';
            case 'image':
                return 'Image';
            case 'video':
                return 'Video';
            case 'graph':
                return 'Graph';
            case 'map':
                return 'Map';
            default:
                return 'Unknown Layer';
        }
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
            <div className="flex-1 truncate text-sm text-foreground">{getLayerName(layer)}</div>
        </div>
    );
}
