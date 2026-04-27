import { CopyIcon, PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react';
import { TipButton } from '@repo/ui/components/tip-button';
import { useEffect, useRef, useState } from 'react';

import type { Slide } from '~/lib/types';

interface SlideItemProps {
    slide: Slide;
    isSelected: boolean;
    isActive: boolean;
    onCopySlide?: (slide: Slide) => void;
    onRenameSlide?: (slideId: string, name: string) => void;
    onDeleteSlide?: (slideId: string) => void;
    canDelete?: boolean;
}

export function SlideItem({
    slide,
    isSelected,
    isActive,
    onCopySlide,
    onRenameSlide,
    onDeleteSlide,
    canDelete = true
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
            className={`group flex items-center rounded-md border px-2 py-1 transition-colors ${
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
                        e.stopPropagation();
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
            {!editing && (
                <div className="flex items-center gap-1">
                    {onRenameSlide && (
                        <TipButton
                            tip="Rename slide"
                            variant="ghost"
                            onClick={(e) => {
                                e.stopPropagation();
                                setEditValue(slide.name);
                                setEditing(true);
                            }}
                            className="opacity-0 group-hover:opacity-100 touch-only:opacity-100 last-touch:opacity-100"
                        >
                            <PencilSimpleIcon size={16} />
                        </TipButton>
                    )}
                    {onCopySlide && (
                        <TipButton
                            tip="Copy slide"
                            variant="ghost"
                            onClick={(e) => {
                                e.stopPropagation();
                                onCopySlide(slide);
                            }}
                            className="opacity-0 group-hover:opacity-100 touch-only:opacity-100 last-touch:opacity-100"
                        >
                            <CopyIcon size={16} />
                        </TipButton>
                    )}
                    {onDeleteSlide && canDelete && (
                        <TipButton
                            tip="Delete slide"
                            variant="destructive"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSlide(slide.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 touch-only:opacity-100 last-touch:opacity-100"
                        >
                            <TrashIcon size={16} />
                        </TipButton>
                    )}
                </div>
            )}
        </div>
    );
}
