import { useDndContext } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React from 'react';

import { useEditor } from '../contexts/EditorContext';
import { Slide } from '../types';
import { SlideItem } from './SlideItem';

interface SortableSlideItemProps {
    slide: Slide;
}

export function SortableSlideItem({ slide }: SortableSlideItemProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: slide.id,
        data: { type: 'slide' }
    });

    const { active } = useDndContext();

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1
    };

    const {
        activeSlideId,
        setActiveSlideId,
        handleCopySlide,
        selectedSlides,
        toggleSlideSelection
    } = useEditor();
    const isSelected = selectedSlides.includes(slide.id);
    const isActive = activeSlideId === slide.id;

    const isAnotherSelectedDragging =
        active && active.id !== slide.id && selectedSlides.includes(active.id as string);

    if (isAnotherSelectedDragging && isSelected) {
        return null;
    }

    const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        toggleSlideSelection(slide.id, e.shiftKey, e.ctrlKey);
        if (!e.shiftKey && !e.ctrlKey) {
            setActiveSlideId(slide.id);
        }
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} onMouseUp={handleMouseUp}>
            <SlideItem
                slide={slide}
                isSelected={isSelected}
                isActive={isActive}
                listeners={listeners}
                onCopySlide={handleCopySlide}
            />
        </div>
    );
}
