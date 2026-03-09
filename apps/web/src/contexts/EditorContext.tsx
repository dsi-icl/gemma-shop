import React, { createContext, useState, useContext } from 'react';

import { Slide, Layer } from '../types';

interface EditorContextType {
    slides: Slide[];
    setSlides: React.Dispatch<React.SetStateAction<Slide[]>>;
    layers: Layer[];
    setLayers: React.Dispatch<React.SetStateAction<Layer[]>>;
    activeSlideId: string;
    setActiveSlideId: React.Dispatch<React.SetStateAction<string>>;
    copiedSlide: Slide | null;
    setCopiedSlide: React.Dispatch<React.SetStateAction<Slide | null>>;
    selectedSlides: string[];
    setSelectedSlides: React.Dispatch<React.SetStateAction<string[]>>;
    toggleSlideSelection: (id: string, isShiftClick: boolean, isCtrlClick: boolean) => void;
    selectedLayers: string[];
    setSelectedLayers: React.Dispatch<React.SetStateAction<string[]>>;
    toggleLayerSelection: (id: string, isShiftClick: boolean, isCtrlClick: boolean) => void;
    handleCopySlide: (slide: Slide) => void;
    handlePasteSlide: () => void;
    handleAddSlide: () => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export const useEditor = () => {
    const context = useContext(EditorContext);
    if (!context) {
        throw new Error('useEditor must be used within a EditorProvider');
    }
    return context;
};

export const EditorProvider = ({ children }: { children: React.ReactNode }) => {
    const [slides, setSlides] = useState<Slide[]>([{ id: 's1', description: 'Main Stage' }]);
    const [layers, setLayers] = useState<Layer[]>([
        { id: 'l1', name: 'Background Image', type: 'image' },
        { id: 'l2', name: 'Main Title', type: 'text' },
        { id: 'l3', name: 'Subtitle', type: 'text' },
        { id: 'l4', name: 'Company Logo', type: 'image' }
    ]);
    const [activeSlideId, setActiveSlideId] = useState<string>('s1');
    const [copiedSlide, setCopiedSlide] = useState<Slide | null>(null);
    const [selectedSlides, setSelectedSlides] = useState<string[]>([]);
    const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
    const [lastSelectedSlide, setLastSelectedSlide] = useState<string | null>(null);
    const [lastSelectedLayer, setLastSelectedLayer] = useState<string | null>(null);

    const toggleSlideSelection = (id: string, isShiftClick: boolean, isCtrlClick: boolean) => {
        if (isShiftClick && lastSelectedSlide) {
            const lastIndex = slides.findIndex((s) => s.id === lastSelectedSlide);
            const currentIndex = slides.findIndex((s) => s.id === id);
            const inBetween = slides.slice(
                Math.min(lastIndex, currentIndex),
                Math.max(lastIndex, currentIndex) + 1
            );
            setSelectedSlides((prev) => [...new Set([...prev, ...inBetween.map((s) => s.id)])]);
        } else if (isCtrlClick) {
            setSelectedSlides((prev) => {
                const newSelection = [...prev];
                const index = newSelection.indexOf(id);
                if (index > -1) {
                    newSelection.splice(index, 1);
                } else {
                    newSelection.push(id);
                }
                return newSelection;
            });
        } else {
            setSelectedSlides([id]);
        }
        setLastSelectedSlide(id);
    };

    const toggleLayerSelection = (id: string, isShiftClick: boolean, isCtrlClick: boolean) => {
        if (isShiftClick && lastSelectedLayer) {
            const lastIndex = layers.findIndex((l) => l.id === lastSelectedLayer);
            const currentIndex = layers.findIndex((l) => l.id === id);
            const inBetween = layers.slice(
                Math.min(lastIndex, currentIndex),
                Math.max(lastIndex, currentIndex) + 1
            );
            setSelectedLayers((prev) => [...new Set([...prev, ...inBetween.map((l) => l.id)])]);
        } else if (isCtrlClick) {
            setSelectedLayers((prev) => {
                const newSelection = [...prev];
                const index = newSelection.indexOf(id);
                if (index > -1) {
                    newSelection.splice(index, 1);
                } else {
                    newSelection.push(id);
                }
                return newSelection;
            });
        } else {
            setSelectedLayers([id]);
        }
        setLastSelectedLayer(id);
    };

    const handleCopySlide = (slide: Slide): void => setCopiedSlide(slide);

    const handlePasteSlide = (): void => {
        if (!copiedSlide) return;
        const newSlide: Slide = {
            ...copiedSlide,
            id: `s${Date.now()}`,
            description: `${copiedSlide.description} (Copy)`
        };
        setSlides((prev) => [...prev, newSlide]);
    };

    const handleAddSlide = (): void => {
        setSlides((prev) => [...prev, { id: `s${Date.now()}`, description: `New Slide` }]);
    };

    return (
        <EditorContext.Provider
            value={{
                slides,
                setSlides,
                layers,
                setLayers,
                activeSlideId,
                setActiveSlideId,
                copiedSlide,
                setCopiedSlide,
                selectedSlides,
                setSelectedSlides,
                toggleSlideSelection,
                selectedLayers,
                setSelectedLayers,
                toggleLayerSelection,
                handleCopySlide,
                handlePasteSlide,
                handleAddSlide
            }}
        >
            {children}
        </EditorContext.Provider>
    );
};
