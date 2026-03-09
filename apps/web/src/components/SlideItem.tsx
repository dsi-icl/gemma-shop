import { CopyIcon } from '@phosphor-icons/react';

import { Slide } from '~/lib/types';

interface SlideItemProps {
    slide: Slide;
    isSelected: boolean;
    isActive: boolean;
    onCopySlide?: (slide: Slide) => void;
}

export function SlideItem({ slide, isSelected, isActive, onCopySlide }: SlideItemProps) {
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
            <div className="flex-1 truncate text-sm font-medium">{slide.description}</div>
            {onCopySlide && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onCopySlide(slide);
                    }}
                    className="hidden rounded p-1.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground"
                    title="Copy Slide"
                >
                    <CopyIcon size={16} weight="bold" />
                </button>
            )}
        </div>
    );
}
