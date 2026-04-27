'use client';

import { EyedropperIcon } from '@phosphor-icons/react';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Popover, PopoverContent, PopoverTrigger } from '@repo/ui/components/popover';
import { TipButton } from '@repo/ui/components/tip-button';
import { PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { HexAlphaColorPicker } from 'react-colorful';

interface ColorPickerProps extends PropsWithChildren {
    value: string;
    tip?: string;
    variant?: Parameters<typeof TipButton>[0]['variant'];
    onChange: (value: string) => void;
}

function normalizeHexColor(raw: string, lengths: number[]): string | null {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('#')) return null;
    const hex = trimmed.slice(1);
    if (!lengths.includes(hex.length)) return null;
    if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
    return `#${hex.toLowerCase()}`;
}

function normalizeIncomingColor(raw: string): string {
    return normalizeHexColor(raw, [3, 4, 6, 8]) ?? normalizeHexColor(raw, [6, 8]) ?? '#000000ff';
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
    const [hasEyeDropper, setHasEyeDropper] = useState(false);
    const [localValue, setLocalValue] = useState(() => normalizeIncomingColor(value));
    const [inputValue, setInputValue] = useState(() => normalizeIncomingColor(value));
    const [isTyping, setIsTyping] = useState(false);
    const lastUserEditAtRef = useRef(0);
    const typingLiveCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setHasEyeDropper('EyeDropper' in window);
    }, []);

    useEffect(() => {
        if (isTyping) return;
        // While the user is actively dragging/typing, parent echoes can be stale
        // (due to debounced/throttled upstream updates). Hold local color briefly.
        const withinUserEditLock = Date.now() - lastUserEditAtRef.current < 200;
        if (withinUserEditLock) return;
        const normalized = normalizeIncomingColor(value);
        if (normalized !== localValue) setLocalValue(normalized);
        if (normalized !== inputValue) setInputValue(normalized);
    }, [value, localValue, inputValue, isTyping]);

    const commitColor = useCallback(
        (next: string, options?: { syncInput?: boolean }) => {
            const syncInput = options?.syncInput ?? true;
            lastUserEditAtRef.current = Date.now();
            setLocalValue(next);
            if (syncInput) setInputValue(next);
            onChange(next);
        },
        [onChange]
    );

    const commitColorFromTyping = useCallback(
        (next: string) => {
            // While typing, only emit upstream for live propagation.
            // Avoid local picker state updates that can cause focus churn.
            lastUserEditAtRef.current = Date.now();
            onChange(next);
        },
        [onChange]
    );

    const queueTypingLiveCommit = useCallback(
        (next: string) => {
            if (typingLiveCommitTimerRef.current) {
                clearTimeout(typingLiveCommitTimerRef.current);
            }
            typingLiveCommitTimerRef.current = setTimeout(() => {
                commitColorFromTyping(next);
                typingLiveCommitTimerRef.current = null;
            }, 120);
        },
        [commitColorFromTyping]
    );

    useEffect(
        () => () => {
            if (typingLiveCommitTimerRef.current) {
                clearTimeout(typingLiveCommitTimerRef.current);
                typingLiveCommitTimerRef.current = null;
            }
        },
        []
    );

    const handleEyeDropper = async () => {
        if (!hasEyeDropper) return;

        try {
            // @ts-expect-error - TypeScript might not recognize EyeDropper yet
            const eyeDropper = new window.EyeDropper();
            const result = await eyeDropper.open();
            commitColor(result.sRGBHex);
        } catch (e) {
            // User cancelled the selection, do nothing
            console.debug('EyeDropper cancelled', e);
        }
    };

    return (
        <div className="space-y-3">
            <HexAlphaColorPicker color={localValue} onChange={commitColor} className="mr-0" />
            <div className="flex w-full items-center gap-2">
                <Input
                    maxLength={9}
                    value={inputValue}
                    onFocus={() => setIsTyping(true)}
                    onBlur={() => {
                        if (typingLiveCommitTimerRef.current) {
                            clearTimeout(typingLiveCommitTimerRef.current);
                            typingLiveCommitTimerRef.current = null;
                        }
                        setIsTyping(false);
                        const normalized = normalizeHexColor(inputValue, [3, 4, 6, 8]);
                        if (normalized) {
                            commitColor(normalized);
                        } else {
                            setInputValue(localValue);
                        }
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            (e.currentTarget as HTMLInputElement).blur();
                        } else if (e.key === 'Escape') {
                            setInputValue(localValue);
                            (e.currentTarget as HTMLInputElement).blur();
                        }
                    }}
                    onChange={(e) => {
                        const next = e.target.value;
                        setInputValue(next);
                        const normalized = normalizeHexColor(next, [3, 4, 6, 8]);
                        if (normalized) {
                            // Commit live while preserving text-input focus/caret.
                            queueTypingLiveCommit(normalized);
                        } else if (typingLiveCommitTimerRef.current) {
                            clearTimeout(typingLiveCommitTimerRef.current);
                            typingLiveCommitTimerRef.current = null;
                        }
                    }}
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
