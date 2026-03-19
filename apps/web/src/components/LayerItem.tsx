import {
    BugBeetleIcon,
    EyeIcon,
    EyeSlashIcon,
    FilmSlateIcon,
    ImageIcon,
    MapTrifoldIcon,
    TextTIcon,
    GraphIcon,
    ScribbleIcon,
    TrashIcon,
    RectangleIcon,
    ShapesIcon,
    CircleIcon
} from '@phosphor-icons/react';
import { TipButton } from '@repo/ui/components/tip-button';
import { cn } from '@repo/ui/lib/utils';
import React from 'react';

import { useEditorStore } from '~/lib/editorStore';
import { LayerWithEditorState } from '~/lib/types';

interface LayerItemProps {
    layer: LayerWithEditorState;
    isSelected: boolean;
}

export function LayerItem({ layer, isSelected }: LayerItemProps) {
    const removeLayer = useEditorStore((s) => s.removeLayer);
    const toggleLayerVisibility = useEditorStore((s) => s.toggleLayerVisibility);
    const isHidden = !layer.config.visible;

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
            case 'shape': {
                switch ((layer as Extract<LayerWithEditorState, { type: 'shape' }>).shape) {
                    case 'circle':
                        return <CircleIcon size={20} weight="bold" />;
                    case 'rectangle':
                        return <RectangleIcon size={20} weight="bold" />;
                    default:
                        return <ShapesIcon size={20} weight="bold" />;
                }
            }
            case 'line':
                return <ScribbleIcon size={20} weight="bold" />;
            default:
                return <BugBeetleIcon size={20} weight="bold" />;
        }
    };

    const getLayerName = (layer: LayerWithEditorState): string => {
        switch (layer.type) {
            case 'text':
                return layer.textHtml.replace(/<[^>]*>/g, '').slice(0, 40) || 'Text';
            case 'image':
                return 'Image';
            case 'video':
                return 'Video';
            case 'graph':
                return 'Graph';
            case 'map':
                return 'Map';
            case 'shape': {
                switch ((layer as Extract<LayerWithEditorState, { type: 'shape' }>).shape) {
                    case 'circle':
                        return 'Circle';
                    case 'rectangle':
                        return 'Rectangle';
                    default:
                        return 'Shape';
                }
            }
            case 'line':
                return 'Line';
            default:
                return 'Unknown Layer';
        }
    };

    return (
        <div
            className={`group flex items-center rounded-md border p-2 shadow-sm transition-colors ${
                isSelected
                    ? 'border-ring bg-accent text-accent-foreground'
                    : 'border-border bg-card hover:border-primary'
            } ${isHidden ? 'opacity-50' : ''}`}
        >
            <div className="mr-2 rounded bg-muted p-1.5 text-muted-foreground">
                {getLayerIcon(layer.type)}
            </div>
            <div className="flex-1 flex-col truncate text-sm text-foreground">
                <span>{getLayerName(layer)}</span>
            </div>
            <div className="flex items-center gap-1">
                <TipButton
                    tip={isHidden ? 'Show layer' : 'Hide layer'}
                    variant="ghost"
                    onClick={() => toggleLayerVisibility(layer.numericId)}
                    className="opacity-0 group-hover:opacity-100"
                >
                    {isHidden ? <EyeSlashIcon /> : <EyeIcon />}
                </TipButton>
                <TipButton
                    tip="Delete layer"
                    variant="destructive"
                    onClick={() => removeLayer(layer.numericId)}
                    className="opacity-0 group-hover:opacity-100"
                >
                    <TrashIcon />
                </TipButton>
            </div>
        </div>
    );
}
