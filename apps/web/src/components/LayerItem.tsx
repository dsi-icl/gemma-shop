import {
    BugBeetleIcon,
    FilmSlateIcon,
    ImageIcon,
    MapTrifoldIcon,
    TextTIcon,
    GraphIcon
} from '@phosphor-icons/react';
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
                return <TextTIcon size={20} weight="bold" />;
            case 'image':
                return <ImageIcon size={20} weight="bold" />;
            case 'video':
                return <FilmSlateIcon size={20} weight="bold" />;
            case 'graph':
                return <GraphIcon size={20} weight="bold" />;
            case 'map':
                return <MapTrifoldIcon size={20} weight="bold" />;
            default:
                return <BugBeetleIcon size={20} weight="bold" />;
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
            <div className="flex-1 flex-col truncate text-sm text-foreground">
                <span>{getLayerName(layer)}</span>
                <span className="flex w-full gap-5 text-xs opacity-45">
                    <span>x:{layer.config.cx}</span>
                    <span>y:{layer.config.cy}</span>
                    <span>r:{layer.config.rotation}</span>
                </span>
            </div>
        </div>
    );
}
