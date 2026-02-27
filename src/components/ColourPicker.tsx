'use client';

import { Pipette } from 'lucide-react';
import { useEffect, useState } from 'react';
import { HexAlphaColorPicker } from 'react-colorful';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface ColorPickerProps {
    value: string;
    onChange: (value: string) => void;
    className?: string;
}

export function ColorPicker({ value, onChange, className }: ColorPickerProps) {
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
            console.log('EyeDropper canceled', e);
        }
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                {/* <Button
                    variant="outline"
                    className={cn(
                        'w-60 justify-start text-left font-normal',
                        !value && 'text-muted-foreground',
                        className
                    )}
                >
                    <div className="flex w-full items-center gap-2">
                        {value ? (
                            <div
                                className="border-border h-4 w-4 rounded-full border"
                                style={{ backgroundColor: value }}
                            />
                        ) : (
                            <Pipette className="h-4 w-4" />
                        )}
                        <div className="flex-1 truncate">{value ? value : 'Pick a color'}</div>
                    </div>
                </Button> */}
                <div className="h-6 w-8" style={{ backgroundColor: value }} />
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3">
                <div className="space-y-3">
                    <HexAlphaColorPicker color={value} onChange={onChange} />
                    <div className="flex w-full items-center gap-2">
                        <Input
                            maxLength={7}
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            className="h-8 font-mono uppercase"
                        />
                        {hasEyeDropper && (
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 shrink-0"
                                onClick={handleEyeDropper}
                                title="Pick color from screen"
                            >
                                <Pipette className="h-4 w-4" />
                                <span className="sr-only">Pick color from screen</span>
                            </Button>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
