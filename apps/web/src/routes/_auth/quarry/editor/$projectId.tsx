import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragStartEvent,
    DragOverlay
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup
} from '@repo/ui/components/resizable';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { LayerItem } from './components/LayerItem';
import { LayerList } from './components/LayerList';
import { MainBoard } from './components/MainBoard';
import { SlideItem } from './components/SlideItem';
import { SlideList } from './components/SlideList';
import { EditorProvider, useEditor } from './contexts/EditorContext';

export const Route = createFileRoute('/_auth/quarry/editor/$projectId')({
    component: PresentationEditor
});

function PresentationEditor() {
    return (
        <EditorProvider>
            <EditorContent />
        </EditorProvider>
    );
}

function EditorContent() {
    const { slides, setSlides, layers, setLayers, activeSlideId, selectedSlides, selectedLayers } =
        useEditor();

    const [activeId, setActiveId] = useState<string | null>(null);
    const activeSlide = slides.find((s) => s.id === activeId);
    const activeLayer = layers.find((l) => l.id === activeId);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveId(null);
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        if (activeId === overId) return;

        const isSlideDrag = active.data.current?.type === 'slide';
        const isLayerDrag = active.data.current?.type === 'layer';

        if (isSlideDrag) {
            setSlides((currentSlides) => {
                const itemsToMove =
                    selectedSlides.length > 1 && selectedSlides.includes(activeId)
                        ? selectedSlides
                        : [activeId];

                if (itemsToMove.some((id) => id === overId)) return currentSlides;

                const activeIndex = currentSlides.findIndex((s) => s.id === activeId);
                const overIndex = currentSlides.findIndex((s) => s.id === overId);
                const draggingDown = activeIndex < overIndex;

                const selectedAndSorted = itemsToMove
                    .map((id) => currentSlides.find((s) => s.id === id)!)
                    .filter(Boolean)
                    .sort((a, b) => currentSlides.indexOf(a) - currentSlides.indexOf(b));

                const newSlides = currentSlides.filter((s) => !itemsToMove.includes(s.id));
                const overItemIndexInNewSlides = newSlides.findIndex((s) => s.id === overId);

                const slicePoint = overItemIndexInNewSlides + (draggingDown ? 1 : 0);
                const part1 = newSlides.slice(0, slicePoint);
                const part2 = newSlides.slice(slicePoint);

                return [...part1, ...selectedAndSorted, ...part2];
            });
        }

        if (isLayerDrag) {
            setLayers((currentLayers) => {
                const itemsToMove =
                    selectedLayers.length > 1 && selectedLayers.includes(activeId)
                        ? selectedLayers
                        : [activeId];

                if (itemsToMove.some((id) => id === overId)) return currentLayers;

                const activeIndex = currentLayers.findIndex((l) => l.id === activeId);
                const overIndex = currentLayers.findIndex((l) => l.id === overId);
                const draggingDown = activeIndex < overIndex;

                const selectedAndSorted = itemsToMove
                    .map((id) => currentLayers.find((l) => l.id === id)!)
                    .filter(Boolean)
                    .sort((a, b) => currentLayers.indexOf(a) - currentLayers.indexOf(b));

                const newLayers = currentLayers.filter((l) => !itemsToMove.includes(l.id));
                const overItemIndexInNewLayers = newLayers.findIndex((l) => l.id === overId);

                const slicePoint = overItemIndexInNewLayers + (draggingDown ? 1 : 0);
                const part1 = newLayers.slice(0, slicePoint);
                const part2 = newLayers.slice(slicePoint);

                return [...part1, ...selectedAndSorted, ...part2];
            });
        }
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <ResizablePanelGroup
                orientation="horizontal"
                className="grow overflow-hidden font-sans text-foreground"
            >
                <MainBoard />
                <ResizableHandle />
                <ResizablePanel defaultSize={400} minSize={200}>
                    <ResizablePanelGroup orientation="vertical" className="h-full bg-card/50">
                        <SlideList />
                        <ResizableHandle withHandle />
                        <LayerList />
                    </ResizablePanelGroup>
                </ResizablePanel>
            </ResizablePanelGroup>
            <DragOverlay>
                {activeSlide ? (
                    selectedSlides.length > 1 && selectedSlides.includes(activeId as string) ? (
                        <div className="rounded-md bg-primary p-2 text-primary-foreground shadow-lg">
                            {selectedSlides.length} slides
                        </div>
                    ) : (
                        <SlideItem
                            slide={activeSlide}
                            isSelected={selectedSlides.includes(activeSlide.id)}
                            isActive={activeSlideId === activeSlide.id}
                        />
                    )
                ) : null}
                {activeLayer ? (
                    selectedLayers.length > 1 && selectedLayers.includes(activeId as string) ? (
                        <div className="rounded-md bg-primary p-2 text-primary-foreground shadow-lg">
                            {selectedLayers.length} layers
                        </div>
                    ) : (
                        <LayerItem
                            layer={activeLayer}
                            isSelected={selectedLayers.includes(activeLayer.id)}
                        />
                    )
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
