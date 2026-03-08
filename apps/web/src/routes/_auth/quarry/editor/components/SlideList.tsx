import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ClipboardTextIcon, PlusIcon, StackIcon } from '@phosphor-icons/react';
import { ResizablePanel } from '@repo/ui/components/resizable';

import { Slide } from '../types';
import { SortableSlideItem } from './SortableSlideItem';

interface SlideListProps {
    slides: Slide[];
    activeSlideId: string;
    setActiveSlideId: (id: string) => void;
    copiedSlide: Slide | null;
    onCopySlide: (slide: Slide) => void;
    onPasteSlide: () => void;
    onAddSlide: () => void;
}

export function SlideList({
    slides,
    activeSlideId,
    setActiveSlideId,
    copiedSlide,
    onCopySlide,
    onPasteSlide,
    onAddSlide
}: SlideListProps) {
    return (
        <ResizablePanel defaultSize={50} minSize={20}>
            <div className="flex h-full flex-col overflow-hidden">
                <div className="flex h-12 items-center justify-between border-b border-border bg-muted/50 px-4">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                        <StackIcon size={18} weight="bold" /> Slides
                    </h2>
                    <div className="flex items-center gap-1 text-muted-foreground">
                        <button
                            onClick={onPasteSlide}
                            disabled={!copiedSlide}
                            className="rounded-md p-1.5 transition-colors hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
                            title="Paste Slide"
                        >
                            <ClipboardTextIcon size={18} weight="bold" />
                        </button>
                        <button
                            onClick={onAddSlide}
                            className="rounded-md p-1.5 transition-colors hover:bg-muted"
                            title="Add Slide"
                        >
                            <PlusIcon size={18} weight="bold" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 space-y-1 overflow-y-auto p-2">
                    <SortableContext
                        items={slides.map((s) => s.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {slides.map((slide) => (
                            <SortableSlideItem
                                key={slide.id}
                                slide={slide}
                                activeSlideId={activeSlideId}
                                onSlideClick={setActiveSlideId}
                                onCopySlide={onCopySlide}
                            />
                        ))}
                    </SortableContext>
                </div>
            </div>
        </ResizablePanel>
    );
}
