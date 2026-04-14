'use client';

import { EyedropperIcon } from '@phosphor-icons/react';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Popover, PopoverContent, PopoverTrigger } from '@repo/ui/components/popover';
import { TipButton } from '@repo/ui/components/tip-button';
import { PropsWithChildren, useEffect, useState } from 'react';
import { HexAlphaColorPicker } from 'react-colorful';

interface ColorPickerProps extends PropsWithChildren {
    value: string;
    tip?: string;
    variant?: Parameters<typeof TipButton>[0]['variant'];
    onChange: (value: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
    const [hasEyeDropper, setHasEyeDropper] = useState(false);

    useEffect(() => {
        setHasEyeDropper('EyeDropper' in window);
    }, []);

    const handleEyeDropper = async () => {
        if (!hasEyeDropper) return;

        try {
            // @ts-expect-error - TypeScript might not recognize EyeDropper yet
            const eyeDropper = new window.EyeDropper();
            const result = await eyeDropper.open();
            onChange(result.sRGBHex);
        } catch (e) {
            // User cancelled the selection, do nothing
            console.debug('EyeDropper cancelled', e);
        }
    };

    return (
        <div className="space-y-3">
            <HexAlphaColorPicker color={value} onChange={onChange} className="mr-0" />
            <div className="flex w-full items-center gap-2">
                <Input
                    maxLength={9}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="h-8 w-39 font-mono uppercase"
                />
                {hasEyeDropper && (
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 shrink-0"
                        onClick={handleEyeDropper}
                        title="Pick color from screen"
                    >
                        <EyedropperIcon className="h-4 w-4" />
                        <span className="sr-only">Pick color from screen</span>
                    </Button>
                )}
            </div>
        </div>
    );
}

export function ColorPickerPopover({ value, onChange, tip, variant, children }: ColorPickerProps) {
    return (
        <Popover>
            <PopoverTrigger nativeButton={false} render={<span className="inline-flex" />}>
                <TipButton
                    tip={tip ?? 'Color'}
                    variant={variant ?? 'outline'}
                    className="h-8 w-8 p-0"
                >
                    {children ?? (
                        <div className="h-4 w-4 rounded-full" style={{ backgroundColor: value }} />
                    )}
                </TipButton>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" side="bottom" align="start">
                <ColorPicker value={value} onChange={onChange} />
            </PopoverContent>
        </Popover>
    );
}
