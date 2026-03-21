import { XIcon } from '@phosphor-icons/react';
import * as React from 'react';

import { cn } from '../lib/utils';
import { Badge } from './badge';

type TagInputProps = {
    value: string[];
    onValueChange: (next: string[]) => void;
    placeholder?: string;
    suggestions?: string[];
    storageKey?: string;
    className?: string;
    disabled?: boolean;
};

const DEFAULT_STORAGE_KEY = 'gemma.tags.history';

function normalizeTag(raw: string): string {
    return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function TagInput({
    value,
    onValueChange,
    placeholder = 'Type a tag and press Enter...',
    suggestions = [],
    storageKey = DEFAULT_STORAGE_KEY,
    className,
    disabled = false
}: TagInputProps) {
    const [inputValue, setInputValue] = React.useState('');
    const [isFocused, setIsFocused] = React.useState(false);
    const [historySuggestions, setHistorySuggestions] = React.useState<string[]>([]);
    const [activeIndex, setActiveIndex] = React.useState<number>(-1);
    const inputId = React.useId();
    const containerRef = React.useRef<HTMLLabelElement | null>(null);
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = window.localStorage.getItem(storageKey);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return;
            setHistorySuggestions(parsed.filter((v): v is string => typeof v === 'string'));
        } catch {
            // ignore malformed storage values
        }
    }, [storageKey]);

    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        const next = Array.from(
            new Set([...value.map(normalizeTag), ...historySuggestions.map(normalizeTag)])
        ).filter(Boolean);
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(next.slice(0, 200)));
            setHistorySuggestions(next.slice(0, 200));
        } catch {
            // ignore storage quota errors
        }
        // intentionally excludes historySuggestions to avoid writing repeatedly
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, storageKey]);

    const allSuggestions = React.useMemo(
        () =>
            Array.from(
                new Set([...suggestions.map(normalizeTag), ...historySuggestions.map(normalizeTag)])
            ).filter(Boolean),
        [suggestions, historySuggestions]
    );

    const filteredSuggestions = React.useMemo(() => {
        const query = normalizeTag(inputValue);
        return allSuggestions
            .filter((tag) => !value.includes(tag))
            .filter((tag) => (query ? tag.includes(query) : true))
            .slice(0, 8);
    }, [allSuggestions, inputValue, value]);

    React.useEffect(() => {
        setActiveIndex(filteredSuggestions.length > 0 ? 0 : -1);
    }, [inputValue, filteredSuggestions.length]);

    const addTag = React.useCallback(
        (raw: string) => {
            const tag = normalizeTag(raw);
            if (!tag || value.includes(tag)) return;
            onValueChange([...value, tag]);
            setInputValue('');
        },
        [onValueChange, value]
    );

    const removeTag = React.useCallback(
        (tag: string) => {
            onValueChange(value.filter((t) => t !== tag));
        },
        [onValueChange, value]
    );

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && inputValue.length === 0 && value.length > 0) {
            e.preventDefault();
            onValueChange(value.slice(0, -1));
            return;
        }

        if (e.key === 'ArrowDown' && filteredSuggestions.length > 0) {
            e.preventDefault();
            setActiveIndex((idx) => (idx + 1) % filteredSuggestions.length);
            return;
        }

        if (e.key === 'ArrowUp' && filteredSuggestions.length > 0) {
            e.preventDefault();
            setActiveIndex((idx) =>
                idx <= 0 ? filteredSuggestions.length - 1 : (idx - 1) % filteredSuggestions.length
            );
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0 && activeIndex < filteredSuggestions.length) {
                addTag(filteredSuggestions[activeIndex]);
            } else {
                addTag(inputValue);
            }
        }
    };

    return (
        <label
            ref={containerRef}
            htmlFor={inputId}
            className={cn(
                'relative border border-input bg-input/30 px-2 py-2',
                isFocused && 'border-ring ring-3 ring-ring/50',
                disabled && 'pointer-events-none opacity-50',
                className
            )}
        >
            <div className="flex flex-wrap items-center gap-1.5">
                {value.map((tag) => (
                    <Badge key={tag} variant="secondary" className="h-6 gap-1 pr-1">
                        {tag}
                        <button
                            type="button"
                            aria-label={`Remove ${tag}`}
                            className="rounded-full p-0.5 hover:bg-foreground/10"
                            onClick={(e) => {
                                e.stopPropagation();
                                removeTag(tag);
                            }}
                        >
                            <XIcon className="size-3" />
                        </button>
                    </Badge>
                ))}
                <input
                    id={inputId}
                    ref={inputRef}
                    value={inputValue}
                    disabled={disabled}
                    onChange={(e) => setInputValue(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => {
                        setIsFocused(false);
                    }}
                    onKeyDown={onKeyDown}
                    placeholder={value.length === 0 ? placeholder : ''}
                    className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
                />
            </div>

            {isFocused && filteredSuggestions.length > 0 ? (
                <div className="absolute top-[calc(100%+6px)] left-0 z-50 w-full overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-2xl ring-1 ring-foreground/5">
                    {filteredSuggestions.map((tag, index) => (
                        <button
                            key={tag}
                            type="button"
                            className={cn(
                                'block w-full cursor-pointer rounded-lg px-2 py-1.5 text-left text-sm',
                                index === activeIndex
                                    ? 'bg-accent text-accent-foreground'
                                    : 'hover:bg-accent/70'
                            )}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                addTag(tag);
                            }}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            ) : null}
        </label>
    );
}
