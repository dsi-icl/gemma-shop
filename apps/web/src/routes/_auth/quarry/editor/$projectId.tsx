import {
    CopyIcon,
    ClipboardTextIcon,
    DotsSixVerticalIcon,
    StackIcon,
    TextTIcon,
    ImageIcon,
    PlusIcon
} from '@phosphor-icons/react';
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup
} from '@repo/ui/components/resizable';
import { createFileRoute } from '@tanstack/react-router';
import React, { useState, useRef } from 'react';

// --- Types & Interfaces ---
export type LayerType = 'text' | 'image' | 'shape';

export interface Slide {
    id: string;
    description: string;
}

export interface Layer {
    id: string;
    name: string;
    type: LayerType;
}

export const Route = createFileRoute('/_auth/quarry/editor/$projectId')({
    component: PresentationEditor
});

function PresentationEditor() {
    // --- State ---
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

    // --- Drag and Drop Handlers ---
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const handleDragStart = (
        e: React.DragEvent<HTMLDivElement>,
        position: number,
        ref: React.RefObject<number | null>
    ): void => {
        ref.current = position;
        if (e.currentTarget) {
            e.currentTarget.style.opacity = '0.5';
        }
    };

    const handleDragEnter = (
        e: React.DragEvent<HTMLDivElement>,
        position: number,
        ref: React.RefObject<number | null>
    ): void => {
        ref.current = position;
    };

    const handleDragEnd = <T,>(
        e: React.DragEvent<HTMLDivElement>,
        list: T[],
        setList: React.Dispatch<React.SetStateAction<T[]>>
    ): void => {
        if (e.currentTarget) {
            e.currentTarget.style.opacity = '1';
        }

        if (dragItem.current === null || dragOverItem.current === null) return;

        const newList = [...list];
        const draggedItemContent = newList[dragItem.current];

        newList.splice(dragItem.current, 1);
        newList.splice(dragOverItem.current, 0, draggedItemContent);

        dragItem.current = null;
        dragOverItem.current = null;
        setList(newList);
    };

    // --- Slide Actions ---
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

    // --- UI Helpers ---
    const getLayerIcon = (type: LayerType): React.ReactNode => {
        return type === 'text' ? (
            <TextTIcon size={16} weight="bold" />
        ) : (
            <ImageIcon size={16} weight="bold" />
        );
    };

    return (
        <ResizablePanelGroup
            orientation="horizontal"
            className="grow overflow-hidden font-sans text-foreground"
        >
            {/* LEFT: Editor / Canvas Area */}
            <ResizablePanel>
                <main className="relative flex h-full flex-col">
                    <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/20 p-8">
                        <div className="relative flex h-[450px] w-[800px] flex-col items-center justify-center rounded-lg bg-card shadow-lg ring-1 ring-border"></div>
                    </div>
                </main>
            </ResizablePanel>

            <ResizableHandle />

            {/* RIGHT: Sidebar */}
            <ResizablePanel defaultSize={400} minSize={200}>
                <ResizablePanelGroup orientation="vertical" className="h-full bg-card/50">
                    {/* Section 1: Slides */}
                    <ResizablePanel defaultSize={50} minSize={20}>
                        <div className="flex h-full flex-col overflow-hidden">
                            <div className="flex h-12 items-center justify-between border-b border-border bg-muted/50 px-4">
                                <h2 className="flex items-center gap-2 text-sm font-semibold">
                                    <StackIcon size={18} weight="bold" /> Slides
                                </h2>
                                <div className="flex items-center gap-1 text-muted-foreground">
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
                                {slides.map((slide, index) => (
                                    <div
                                        key={slide.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, index, dragItem)}
                                        onDragEnter={(e) => handleDragEnter(e, index, dragOverItem)}
                                        onDragEnd={(e) =>
                                            handleDragEnd<Slide>(e, slides, setSlides)
                                        }
                                        onClick={() => setActiveSlideId(slide.id)}
                                        className={`group flex cursor-pointer items-center rounded-md border p-2 transition-colors ${
                                            activeSlideId === slide.id
                                                ? 'border-accent bg-accent text-accent-foreground'
                                                : 'border-transparent bg-card hover:border-border hover:bg-muted'
                                        }`}
                                    >
                                        <div className="mr-2 cursor-grab text-muted-foreground hover:text-foreground">
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
                                ))}
                            </div>
                        </div>
                    </ResizablePanel>

                    <ResizableHandle withHandle />

                    <ResizablePanel defaultSize={50} minSize={20}>
                        <div className="flex h-full flex-col overflow-hidden bg-muted/30">
                            <div className="flex h-12 items-center border-b border-border bg-muted/50 px-4">
                                <h2 className="text-sm font-semibold">Layers (Current Slide)</h2>
                            </div>

                            <div className="flex-1 space-y-1 overflow-y-auto p-2">
                                {layers.map((layer, index) => (
                                    <div
                                        key={layer.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, index, dragItem)}
                                        onDragEnter={(e) => handleDragEnter(e, index, dragOverItem)}
                                        onDragEnd={(e) =>
                                            handleDragEnd<Layer>(e, layers, setLayers)
                                        }
                                        className="flex cursor-grab items-center rounded-md border border-border bg-card p-2 shadow-sm transition-colors hover:border-primary"
                                    >
                                        <div className="mr-2 text-muted-foreground">
                                            <DotsSixVerticalIcon size={20} weight="bold" />
                                        </div>
                                        <div className="mr-2 rounded bg-muted p-1.5 text-muted-foreground">
                                            {getLayerIcon(layer.type)}
                                        </div>
                                        <div className="flex-1 truncate text-sm text-foreground">
                                            {layer.name}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </ResizablePanel>
                </ResizablePanelGroup>
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}
