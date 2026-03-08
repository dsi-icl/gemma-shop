import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from '@repo/ui/components/resizable';
import { createFileRoute } from '@tanstack/react-router';
import { LayerList } from './components/LayerList';
import { MainBoard } from './components/MainBoard';
import { SlideList } from './components/SlideList';
import { EditorProvider, useEditor } from './contexts/EditorContext';

export const Route = createFileRoute('/_auth/quarry/editor/$projectId')({
    component: PresentationEditor,
});

function PresentationEditor() {
    return (
        <EditorProvider>
            <EditorContent />
        </EditorProvider>
    );
}

function EditorContent() {
    const { 
        setSlides, 
        setLayers,
        selectedSlides, setSelectedSlides, 
        selectedLayers, setSelectedLayers,
    } = useEditor();

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;
    
        const activeId = active.id as string;
        const overId = over.id as string;
    
        if (activeId === overId) return;
    
        const isSlideDrag = active.data.current?.type === 'slide';
        const isLayerDrag = active.data.current?.type === 'layer';
    
        if (isSlideDrag) {
            setSlides((currentSlides) => {
                const activeIndex = currentSlides.findIndex((s) => s.id === activeId);
                const overIndex = currentSlides.findIndex((s) => s.id === overId);
    
                if (selectedSlides.length > 1 && selectedSlides.includes(activeId)) {
                    const selectedAndSorted = selectedSlides
                        .map(id => currentSlides.find(s => s.id === id)!)
                        .filter(Boolean)
                        .sort((a, b) => currentSlides.indexOf(a) - currentSlides.indexOf(b));
                    
                    const newSlides = currentSlides.filter(s => !selectedSlides.includes(s.id));
                    const insertIndex = newSlides.findIndex(s => s.id === overId);
                    
                    newSlides.splice(insertIndex >= 0 ? insertIndex : newSlides.length, 0, ...selectedAndSorted);
                    setSelectedSlides([]);
                    return newSlides;
                }
    
                return arrayMove(currentSlides, activeIndex, overIndex);
            });
        }
    
        if (isLayerDrag) {
            setLayers((currentLayers) => {
                const activeIndex = currentLayers.findIndex((l) => l.id === activeId);
                const overIndex = currentLayers.findIndex((l) => l.id === overId);

                if (selectedLayers.length > 1 && selectedLayers.includes(activeId)) {
                    const selectedAndSorted = selectedLayers
                        .map(id => currentLayers.find(l => l.id === id)!)
                        .filter(Boolean)
                        .sort((a, b) => currentLayers.indexOf(a) - currentLayers.indexOf(b));

                    const newLayers = currentLayers.filter(l => !selectedLayers.includes(l.id));
                    const insertIndex = newLayers.findIndex(l => l.id === overId);

                    newLayers.splice(insertIndex >= 0 ? insertIndex : newLayers.length, 0, ...selectedAndSorted);
                    setSelectedLayers([]);
                    return newLayers;
                }
    
                return arrayMove(currentLayers, activeIndex, overIndex);
            });
        }
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
                        <SlideList />
                        <ResizableHandle withHandle />
                        <LayerList />
                    </ResizablePanelGroup>
                </ResizablePanel>
            </ResizablePanelGroup>
        </DndContext>
    );
}
