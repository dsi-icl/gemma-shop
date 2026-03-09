import { ClipboardTextIcon, PlusIcon, StackIcon } from '@phosphor-icons/react';
import { ResizablePanel } from '@repo/ui/components/resizable';

import { useEditor } from '../contexts/EditorContext';
import { Slide } from '../types';
import { DraggableList } from './DraggableList';
import { SlideItem } from './SlideItem';

export function SlideList() {
    const {
        slides,
        setSlides,
        activeSlideId,
        setActiveSlideId,
        copiedSlide,
        selectedSlides,
        toggleSlideSelection,
        handleCopySlide,
        handlePasteSlide,
        handleAddSlide
    } = useEditor();

    const handleSelect = (id: string, shiftKey: boolean, ctrlKey: boolean) => {
        toggleSlideSelection(id, shiftKey, ctrlKey);
        if (!shiftKey && !ctrlKey) {
            setActiveSlideId(id);
        }
    };

    return (
        <ResizablePanel defaultSize={50} minSize={20}>
            <div className="flex h-full flex-col overflow-hidden">
                <div className="flex h-12 items-center justify-between border-b border-border bg-muted/50 px-4">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                        <StackIcon size={18} weight="bold" /> Slides
                    </h2>
                    <div className="flex hidden items-center gap-1 text-muted-foreground">
                        <button
                            onClick={handlePasteSlide}
                            disabled={!copiedSlide}
                            className="rounded-md p-1.5 transition-colors hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
                            title="Paste Slide"
                        >
                            <ClipboardTextIcon size={18} weight="bold" />
                        </button>
                        <button
                            onClick={handleAddSlide}
                            className="rounded-md p-1.5 transition-colors hover:bg-muted"
                            title="Add Slide"
                        >
                            <PlusIcon size={18} weight="bold" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 space-y-1 overflow-y-auto p-2">
                    <DraggableList
                        items={slides}
                        selectedIds={selectedSlides}
                        onReorder={setSlides}
                        onSelect={handleSelect}
                        itemRenderer={(slide, { isSelected }) => (
                            <SlideItem
                                slide={slide}
                                isSelected={isSelected}
                                isActive={activeSlideId === slide.id}
                                onCopySlide={handleCopySlide}
                            />
                        )}
                        overlayRenderer={(slide) => (
                            <SlideItem
                                slide={slide}
                                isSelected={selectedSlides.includes(slide.id)}
                                isActive={activeSlideId === slide.id}
                            />
                        )}
                        multiDragLabel={(count) => (
                            <div className="rounded-md bg-primary p-2 text-primary-foreground shadow-lg">
                                {count} slides
                            </div>
                        )}
                    />
                </div>
            </div>
        </ResizablePanel>
    );
}
