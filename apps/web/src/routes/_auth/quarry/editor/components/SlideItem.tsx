import { CopyIcon, DotsSixVerticalIcon } from '@phosphor-icons/react';
import React from 'react';

import { Slide } from '../types';

interface SlideItemProps {
    slide: Slide;
    isSelected: boolean;
    isActive: boolean;
    listeners?: any;
    onCopySlide?: (slide: Slide) => void;
}

export function SlideItem({ slide, isSelected, isActive, listeners, onCopySlide }: SlideItemProps) {
    return (
        <div
            className={`group flex cursor-pointer items-center rounded-md border p-2 transition-colors ${
                isSelected
                    ? 'border-blue-500 bg-blue-100 dark:bg-blue-900'
                    : isActive
                      ? 'border-accent bg-accent text-accent-foreground'
                      : 'border-transparent bg-card hover:border-border hover:bg-muted'
            }`}
        >
            <div
                {...listeners}
                className="mr-2 cursor-grab text-muted-foreground hover:text-foreground"
            >
                <DotsSixVerticalIcon size={20} weight="bold" />
            </div>
            <div className="flex-1 truncate text-sm font-medium">{slide.description}</div>
            {onCopySlide && (
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
