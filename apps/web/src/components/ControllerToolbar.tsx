import { PencilSimpleIcon } from '@phosphor-icons/react';
import { Separator } from '@repo/ui/components/separator';
import { TipButton } from '@repo/ui/components/tip-button';
import { TooltipProvider } from '@repo/ui/components/tooltip';

import { StrokeTool } from '~/components/StrokeTool';

interface ControllerToolbarProps {
    isDrawing: boolean;
    canDraw: boolean;
    onToggleDrawing: () => void;
    strokeColor: string;
    setStrokeColor: (color: string) => void;
    strokeWidth: number;
    setStrokeWidth: (width: number) => void;
    strokeDash: number[];
    setStrokeDash: (dash: number[]) => void;
}

export function ControllerToolbar({
    isDrawing,
    canDraw,
    onToggleDrawing,
    strokeColor,
    setStrokeColor,
    strokeWidth,
    setStrokeWidth,
    strokeDash,
    setStrokeDash
}: ControllerToolbarProps) {
    return (
        <TooltipProvider>
            <div
                id="toolbar"
                className="flex h-11 min-h-11 items-center gap-1 border-t border-b border-border bg-card/50 px-2 py-1"
            >
                <TipButton
                    tip={canDraw ? 'Draw' : 'Connect to a slide to draw'}
                    tipSide="bottom"
                    onClick={onToggleDrawing}
                    variant={isDrawing ? 'outline' : 'ghost'}
                    disabled={!canDraw}
                >
                    <PencilSimpleIcon />
                </TipButton>
                <StrokeTool
                    strokeColor={strokeColor}
                    setStrokeColor={setStrokeColor}
                    strokeWidth={strokeWidth}
                    setStrokeWidth={setStrokeWidth}
                    strokeDash={strokeDash}
                    setStrokeDash={setStrokeDash}
                />
                <Separator orientation="vertical" className="mx-1 my-1 h-6" />
            </div>
        </TooltipProvider>
    );
}
