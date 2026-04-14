'use client';

import { Input } from '@repo/ui/components/input';
import { Slider } from '@repo/ui/components/slider';
import { useCallback } from 'react';

import { ColorPickerPopover } from '~/components/ColourPicker';
import { EditorEngine } from '~/lib/editorEngine';
import { useEditorStore } from '~/lib/editorStore';
import type { LayerWithEditorState } from '~/lib/types';

type BackgroundLayer = Extract<LayerWithEditorState, { type: 'background' }>;

interface BackgroundLayerPanelProps {
    activeLayer: BackgroundLayer;
}

export function BackgroundLayerPanel({ activeLayer }: BackgroundLayerPanelProps) {
    const updateField = useCallback(
        <K extends keyof BackgroundLayer>(key: K, value: BackgroundLayer[K]) => {
            const updated = { ...activeLayer, [key]: value } as BackgroundLayer;
            useEditorStore.setState((s) => {
                const newLayers = new Map(s.layers);
                newLayers.set(activeLayer.numericId, updated);
                return { layers: newLayers };
            });
            EditorEngine.getInstance().sendJSON({
                type: 'upsert_layer',
                origin: 'editor:background_panel',
                layer: updated
            });
            useEditorStore.getState().markDirty();
        },
        [activeLayer]
    );

    return (
        <>
            <ColorPickerPopover
                tip="Background colour"
                value={activeLayer.backgroundColor}
                onChange={(v) => updateField('backgroundColor', v)}
            />
            <ColorPickerPopover
                tip="Atmosphere colour"
                value={activeLayer.atmosphereColor}
                onChange={(v) => updateField('atmosphereColor', v)}
            />
            <ColorPickerPopover
                tip="Motif colour 1"
                value={activeLayer.motifColor1}
                onChange={(v) => updateField('motifColor1', v)}
            />
            <ColorPickerPopover
                tip="Motif colour 2"
                value={activeLayer.motifColor2}
                onChange={(v) => updateField('motifColor2', v)}
            />
            <Input
                type="number"
                min={0}
                max={9999}
                value={activeLayer.noiseSeed}
                onChange={(e) => updateField('noiseSeed', parseInt(e.target.value) || 0)}
                className="h-7 w-20 text-xs"
                placeholder="Seed"
            />
            <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                    Speed ({activeLayer.speedFactor.toFixed(1)}×)
                </label>
                <Slider
                    value={[activeLayer.speedFactor]}
                    min={0}
                    max={5}
                    step={0.1}
                    onValueChange={(v) => {
                        const next = Array.isArray(v) ? (v[0] ?? 1) : v;
                        updateField('speedFactor', next);
                    }}
                />
            </div>
        </>
    );
}
