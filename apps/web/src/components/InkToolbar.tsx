import { Button } from '@repo/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@repo/ui/components/popover';
import { Slider } from '@repo/ui/components/slider';
import { TipButton } from '@repo/ui/components/tip-button';
import { ToggleGroup, ToggleGroupItem } from '@repo/ui/components/toggle-group';

import { useEditorStore } from '~/lib/editorStore';

import { ColorPicker } from './ColourPicker';

export function InkToolbar() {
    const { inkColour, setInkColour, inkWidth, setInkWidth, inkDash, setInkDash } =
        useEditorStore();

    return (
        <div className="flex items-center gap-2">
            <ColorPicker value={inkColour} onChange={setInkColour} />
            <Popover>
                <PopoverTrigger>
                    <TipButton tip="Line Style" variant="outline" size="sm" className="">
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
                                stroke={inkColour}
                                stroke-width={inkWidth / 7}
                                stroke-dasharray={inkDash.map((d) => d / 7)}
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                        </svg>
                    </TipButton>
                </PopoverTrigger>
                <PopoverContent side="top" className="w-48 p-3">
                    <div className="flex flex-col gap-4">
                        <div className="space-y-2">
                            <h4 className="leading-none font-medium">Stroke Width</h4>
                            <Slider
                                value={[inkWidth]}
                                onValueChange={(v) => setInkWidth(Array.isArray(v) ? v[0] : v)}
                                min={5}
                                max={50}
                                step={5}
                            />
                        </div>
                        <ToggleGroup
                            value={[JSON.stringify(inkDash)]}
                            onValueChange={(value) => setInkDash(JSON.parse(value[0]))}
                            className="flex-wrap"
                        >
                            <ToggleGroupItem value="[]" aria-label="Solid">
                                <div className="h-0.5 w-4" style={{ backgroundColor: inkColour }} />
                            </ToggleGroupItem>
                            <ToggleGroupItem value="[10,100]" aria-label="Dotted">
                                <div
                                    className="h-0.5 w-4"
                                    style={{
                                        background: `linear-gradient(to right, ${inkColour} 50%, transparent 50%)`,
                                        backgroundSize: '10px 100%'
                                    }}
                                />
                            </ToggleGroupItem>
                            <ToggleGroupItem value="[100,100]" aria-label="Dashed">
                                <div
                                    className="h-0.5 w-4"
                                    style={{
                                        background: `linear-gradient(to right, ${inkColour} 50%, transparent 50%)`,
                                        backgroundSize: '20px 100%'
                                    }}
                                />
                            </ToggleGroupItem>
                        </ToggleGroup>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}
