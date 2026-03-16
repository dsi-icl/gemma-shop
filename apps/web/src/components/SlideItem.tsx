import { CopyIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

import type { Slide } from '~/lib/types';

interface SlideItemProps {
    slide: Slide;
    isSelected: boolean;
    isActive: boolean;
    onCopySlide?: (slide: Slide) => void;
    onRenameSlide?: (slideId: string, name: string) => void;
}

export function SlideItem({
    slide,
    isSelected,
    isActive,
    onCopySlide,
    onRenameSlide
}: SlideItemProps) {
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState(slide.name);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [editing]);

    const commitRename = () => {
        const trimmed = editValue.trim();
        setEditing(false);
        if (trimmed && trimmed !== slide.name) {
            onRenameSlide?.(slide.id, trimmed);
        }
    };

    return (
        <div
            className={`group flex items-center rounded-md border p-2 transition-colors ${
                isSelected
                    ? 'border-ring bg-accent text-accent-foreground'
                    : isActive
                      ? 'border-accent bg-accent text-accent-foreground'
                      : 'border-transparent bg-card hover:border-border hover:bg-muted'
            }`}
        >
            {editing ? (
                <input
                    ref={inputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setEditing(false);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 rounded border border-ring bg-background px-1 text-sm font-medium outline-none"
                />
            ) : (
                <div
                    className="flex-1 truncate text-sm font-medium"
                    onDoubleClick={(e) => {
                        if (!onRenameSlide) return;
                        e.stopPropagation();
                        setEditValue(slide.name);
                        setEditing(true);
                    }}
                >
                    {slide.name}
                </div>
            )}
            {!editing && onRenameSlide && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setEditValue(slide.name);
                        setEditing(true);
                    }}
                    className="rounded p-1.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground"
                    title="Rename Slide"
                >
                    <PencilSimpleIcon size={16} weight="bold" />
                </button>
            )}
            {!editing && onCopySlide && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onCopySlide(slide);
                    }}
                    className="rounded p-1.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground"
                    title="Copy Slide"
                >
                    <CopyIcon size={16} weight="bold" />
                </button>
            )}
        </div>
    );
}
