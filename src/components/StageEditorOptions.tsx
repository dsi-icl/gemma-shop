import { EraserIcon } from '@phosphor-icons/react';

import { envVar, updateEnvVar } from '@/lib/stageTools';

import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Toggle } from './ui/toggle';

export const StageEditorOptions = () => {
    // const { data: env } = useLiveQuery((q) => q.from({ env: appEnvCollection }));
    // const environment = (env as any[]).reduce((acc, curr) => {
    //     acc[curr.key] = curr.value;
    //     return acc;
    // }, {}) as UnionToRecord<(typeof env)[number]> & {};

    return (
        <>
            <div className="flex gap-4 p-4">
                <div className="flex items-center space-x-2">
                    <Switch
                        id="show-grid"
                        checked={envVar('editor:showGrid')}
                        onCheckedChange={() =>
                            updateEnvVar('editor:showGrid', !envVar('editor:showGrid'))
                        }
                    />
                    <Label htmlFor="show-grid">Show Grid</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <Switch
                        id="show-highlight"
                        checked={envVar('editor:highlightBg')}
                        onCheckedChange={() =>
                            updateEnvVar('editor:highlightBg', !envVar('editor:highlightBg'))
                        }
                    />
                    <Label htmlFor="show-highlight">Highlight Background</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <Switch
                        id="show-ink"
                        checked={envVar('editor:showInk')}
                        onCheckedChange={() =>
                            updateEnvVar('editor:showInk', !envVar('editor:showInk'))
                        }
                    />
                    <Label htmlFor="show-ink">Show Ink</Label>
                </div>
            </div>
            <div className="flex gap-4 p-4">
                <div className="flex items-center space-x-2">
                    <Toggle
                        aria-label="Toggle eraser"
                        size="sm"
                        variant="outline"
                        onPressedChange={() =>
                            updateEnvVar(
                                'editor:inkTool',
                                envVar('editor:inkTool') === 'eraser' ? 'brush' : 'eraser'
                            )
                        }
                    >
                        <EraserIcon
                            weight={envVar('editor:inkTool') === 'eraser' ? 'fill' : 'regular'}
                            className="group-data-[state=on]/toggle:fill-foreground"
                        />
                        Eraser
                    </Toggle>
                </div>
            </div>
        </>
    );
};
