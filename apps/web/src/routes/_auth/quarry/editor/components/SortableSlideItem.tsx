import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    CopyIcon,
    DotsSixVerticalIcon,
} from '@phosphor-icons/react';
import React from 'react';
import { useEditor } from '../contexts/EditorContext';
import { Slide } from '../types';

interface SortableSlideItemProps {
    slide: Slide;
}

export function SortableSlideItem({ slide }: SortableSlideItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: slide.id, data: { type: 'slide' } });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };
    
    const { 
        activeSlideId, setActiveSlideId,
        handleCopySlide,
        selectedSlides, toggleSlideSelection 
    } = useEditor();
    const isSelected = selectedSlides.includes(slide.id);

    const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        toggleSlideSelection(slide.id, e.shiftKey, e.ctrlKey);
        if (!e.shiftKey && !e.ctrlKey) {
            setActiveSlideId(slide.id);
        }
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            onMouseUp={handleMouseUp}
            className={`group flex cursor-pointer items-center rounded-md border p-2 transition-colors ${
                isSelected
                ? 'border-blue-500 bg-blue-100 dark:bg-blue-900'
                : activeSlideId === slide.id
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-transparent bg-card hover:border-border hover:bg-muted'
            }`}
        >
            <div {...listeners} className="mr-2 cursor-grab text-muted-foreground hover:text-foreground">
                <DotsSixVerticalIcon size={20} weight="bold" />
            </div>
            <div className="flex-1 truncate text-sm font-medium">
                {slide.description}
            </div>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    handleCopySlide(slide);
                }}
                className="rounded p-1.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground"
                title="Copy Slide"
            >
                <CopyIcon size={16} weight="bold" />
            </button>
        </div>
    );
}
