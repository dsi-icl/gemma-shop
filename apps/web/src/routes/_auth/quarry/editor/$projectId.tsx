import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup
} from '@repo/ui/components/resizable';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { LayerList } from './components/LayerList';
import { MainBoard } from './components/MainBoard';
import { SlideList } from './components/SlideList';
import { Layer, Slide } from './types';

export const Route = createFileRoute('/_auth/quarry/editor/$projectId')({
    component: PresentationEditor
});

function PresentationEditor() {
    const [slides, setSlides] = useState<Slide[]>([
        { id: 's1', description: 'Title Slide' },
        { id: 's2', description: 'Agenda' },
        { id: 's3', description: 'Financial Overview' }
    ]);
    const [activeSlideId, setActiveSlideId] = useState<string>('s1');
    const [copiedSlide, setCopiedSlide] = useState<Slide | null>(null);

    const [layers, setLayers] = useState<Layer[]>([
        { id: 'l1', name: 'Background Image', type: 'image' },
        { id: 'l2', name: 'Main Title', type: 'text' },
        { id: 'l3', name: 'Subtitle', type: 'text' },
        { id: 'l4', name: 'Company Logo', type: 'image' }
    ]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            if (active.data.current?.type === 'slide') {
                setSlides((items) => {
                    const oldIndex = items.findIndex((item) => item.id === active.id);
                    const newIndex = items.findIndex((item) => item.id === over.id);
                    return arrayMove(items, oldIndex, newIndex);
                });
            }
            if (active.data.current?.type === 'layer') {
                setLayers((items) => {
                    const oldIndex = items.findIndex((item) => item.id === active.id);
                    const newIndex = items.findIndex((item) => item.id === over.id);
                    return arrayMove(items, oldIndex, newIndex);
                });
            }
        }
    };

    const handleCopySlide = (slide: Slide): void => setCopiedSlide(slide);

    const handlePasteSlide = (): void => {
        if (!copiedSlide) return;
        const newSlide: Slide = {
            ...copiedSlide,
            id: `s${Date.now()}`,
            description: `${copiedSlide.description} (Copy)`
        };
        setSlides([...slides, newSlide]);
    };

    const handleAddSlide = (): void => {
        setSlides([...slides, { id: `s${Date.now()}`, description: `New Slide` }]);
    };

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <ResizablePanelGroup
                orientation="horizontal"
                className="grow overflow-hidden font-sans text-foreground"
            >
                <MainBoard />

                <ResizableHandle />

                <ResizablePanel defaultSize={400} minSize={200}>
                    <ResizablePanelGroup orientation="vertical" className="h-full bg-card/50">
                        <SlideList
                            slides={slides}
                            activeSlideId={activeSlideId}
                            setActiveSlideId={setActiveSlideId}
                            copiedSlide={copiedSlide}
                            onCopySlide={handleCopySlide}
                            onPasteSlide={handlePasteSlide}
                            onAddSlide={handleAddSlide}
                        />

                        <ResizableHandle withHandle />

                        <LayerList layers={layers} />
                    </ResizablePanelGroup>
                </ResizablePanel>
            </ResizablePanelGroup>
        </DndContext>
    );
}
