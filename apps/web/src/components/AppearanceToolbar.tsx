import { Popover, PopoverContent, PopoverTrigger } from '@repo/ui/components/popover';
import { Slider } from '@repo/ui/components/slider';
import { TipButton } from '@repo/ui/components/tip-button';
import { ToggleGroup, ToggleGroupItem } from '@repo/ui/components/toggle-group';
import { throttle } from '@tanstack/pacer';

import { useEditorStore } from '~/lib/editorStore';

import { ColorPicker, ColorPickerPopover } from './ColourPicker';

const getPolylinePreview = ({
    strokeColor,
    strokeWidth,
    strokeDash
}: {
    strokeColor: string;
    strokeWidth: number;
    strokeDash: number[];
}) => {
    return (
        <svg
            width="100"
            height="20"
            viewBox="-5 0 110 20"
            xmlns="http://www.w3.org/2000/svg"
            className="w-auto!"
        >
            {/* <path
                            d="M 0 10 Q 12.5 0, 25 10 T 50 10 T 75 10 T 100 10" */}
            <polyline
                points="0,10 5,12.7 10,14 15,13.1 20,10.6 25,7.7 30,6.1 35,6.6 40,8.9 45,11.7 50,13.7 55,13.7 60,11.6 65,8.8 70,6.5 75,6.1 80,7.8 85,10.6 90,13.1 95,13.9 100,12.6"
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth / 7}
                strokeDasharray={strokeDash.map((d) => d / 7).join(' ')}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
};

export function AppearanceToolbar() {
    const {
        shapeFill,
        setShapeFill,
        strokeColor,
        setStrokeColor,
        strokeWidth,
        setStrokeWidth,
        strokeDash,
        setStrokeDash
    } = useEditorStore();

    return (
        <div className="flex items-center gap-2">
            <ColorPickerPopover value={shapeFill} onChange={setShapeFill} />
            <Popover>
                <PopoverTrigger>
                    <TipButton tip="Line Style" variant="outline" size="sm" className="">
                        {getPolylinePreview({
                            strokeColor,
                            strokeWidth,
                            strokeDash
                        })}
                    </TipButton>
                </PopoverTrigger>
                <PopoverContent className="w-120 p-3" side="bottom" align="start">
                    <div className="flex gap-10">
                        <ColorPicker value={strokeColor} onChange={setStrokeColor} />
                        <div className="flex flex-col gap-4 p-3">
                            <div className="space-y-2">
                                <h4 className="leading-none font-medium">Stroke Width</h4>
                                <Slider
                                    value={[strokeWidth]}
                                    onValueChange={(v) =>
                                        setStrokeWidth(Array.isArray(v) ? v[0] : v)
                                    }
                                    min={5}
                                    max={50}
                                    step={5}
                                />
                            </div>
                            <ToggleGroup
                                orientation="vertical"
                                value={[JSON.stringify(strokeDash)]}
                                onValueChange={(value) => setStrokeDash(JSON.parse(value[0]))}
                                className="flex-wrap"
                            >
                                <ToggleGroupItem value="[]">
                                    {getPolylinePreview({
                                        strokeColor,
                                        strokeWidth,
                                        strokeDash: []
                                    })}
                                </ToggleGroupItem>
                                <ToggleGroupItem value="[10,100]">
                                    {getPolylinePreview({
                                        strokeColor,
                                        strokeWidth,
                                        strokeDash: [10, 100]
                                    })}
                                </ToggleGroupItem>
                                <ToggleGroupItem value="[100,100]">
                                    {getPolylinePreview({
                                        strokeColor,
                                        strokeWidth,
                                        strokeDash: [100, 100]
                                    })}
                                </ToggleGroupItem>
                                <ToggleGroupItem value="[100,100,10,100]">
                                    {getPolylinePreview({
                                        strokeColor,
                                        strokeWidth,
                                        strokeDash: [100, 100, 10, 100]
                                    })}
                                </ToggleGroupItem>
                            </ToggleGroup>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}
