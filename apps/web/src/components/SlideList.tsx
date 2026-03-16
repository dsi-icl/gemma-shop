import { CaretDownIcon, SlideshowIcon } from '@phosphor-icons/react';
import { useNavigate } from '@tanstack/react-router';

import { useEditorStore } from '~/lib/editorStore';

import { DraggableList } from './DraggableList';
import { SlideItem } from './SlideItem';

interface SlideListProps {
    titleBarSize?: number;
    collapsed?: boolean;
    onCollapse?: () => void;
    onExpand?: () => void;
}

export function SlideList({ collapsed, onCollapse, onExpand, titleBarSize = 48 }: SlideListProps) {
    const slides = useEditorStore((s) => s.slides);
    const activeSlideId = useEditorStore((s) => s.activeSlideId);
    const selectedSlides = useEditorStore((s) => s.selectedSlides);
    const reorderSlides = useEditorStore((s) => s.reorderSlides);
    const toggleSlideSelection = useEditorStore((s) => s.toggleSlideSelection);
    const setActiveSlideId = useEditorStore((s) => s.setActiveSlideId);
    const copySlide = useEditorStore((s) => s.copySlide);
    const renameSlide = useEditorStore((s) => s.renameSlide);
    const projectId = useEditorStore((s) => s.projectId);
    const navigate = useNavigate();

    const handleSelect = (id: string, shiftKey: boolean, ctrlKey: boolean) => {
        toggleSlideSelection(id, shiftKey, ctrlKey);
        if (!shiftKey && !ctrlKey) {
            setActiveSlideId(id);
            const { commitId } = useEditorStore.getState();
            if (projectId && commitId) {
                navigate({
                    to: '/quarry/editor/$projectId/$commitId/$slideId',
                    params: { projectId, commitId, slideId: id }
                });
            }
        }
    };

    const toggleCollapse = () => {
        if (collapsed) onExpand?.();
        else onCollapse?.();
    };

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <button
                onClick={toggleCollapse}
                className="flex shrink-0 cursor-pointer items-center justify-between border-b border-border bg-muted/50 px-4"
                style={{ height: titleBarSize }}
            >
                <h2
                    className="flex items-center gap-2 text-sm font-semibold"
                    style={{ height: titleBarSize }}
                >
                    <SlideshowIcon size={18} weight="bold" /> Slides
                </h2>
                <CaretDownIcon
                    size={14}
                    weight="bold"
                    className={`text-muted-foreground transition-transform ${collapsed ? '' : 'rotate-180'}`}
                />
            </button>

            {!collapsed && (
                <div className="flex-1 space-y-1 overflow-y-auto p-2">
                    <DraggableList
                        items={slides.sort((a, b) => a.order - b.order)}
                        selectedIds={selectedSlides}
                        onReorder={reorderSlides}
                        onSelect={handleSelect}
                        itemRenderer={(slide, { isSelected }) => (
                            <SlideItem
                                slide={slide}
                                isSelected={isSelected}
                                isActive={activeSlideId === slide.id}
                                onCopySlide={copySlide}
                                onRenameSlide={renameSlide}
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
            )}
        </div>
    );
}
