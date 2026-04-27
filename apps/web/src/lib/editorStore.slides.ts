import { $copySlideInCommit, $deleteSlideFromCommit } from '../server/projects.fns';
import type { EditorState, SliceHelpers } from './editorStore.types';
import type { Slide } from './types';

type SliceSet = (
    partial: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)
) => void;
type SliceGet = () => EditorState;

function generateSlideId(): string {
    return crypto.randomUUID();
}

export function createSlideSlice(set: SliceSet, get: SliceGet, helpers: SliceHelpers) {
    return {
        setSlides: (slides: Slide[]) => set({ slides }),
        setActiveSlideId: (id: string | null) => set({ activeSlideId: id }),
        setSelectedSlides: (ids: string[]) => set({ selectedSlides: ids }),

        addSlide: () => {
            const newSlides = [
                ...get().slides,
                { id: generateSlideId(), name: 'New Slide', order: get().slides.length }
            ];
            set({ slides: newSlides });
            helpers.broadcastSlides(newSlides);
            get().markDirty();
        },

        copySlide: async (slide: Slide) => {
            const { commitId } = get();
            if (!commitId) return;

            const newSlideId = generateSlideId();
            const newSlideName = `${slide.name} (Copy)`;

            try {
                await $copySlideInCommit({
                    data: { commitId, sourceSlideId: slide.id, newSlideId, newSlideName }
                });

                const newSlide: Slide = {
                    id: newSlideId,
                    order: slide.order + 0.5,
                    name: newSlideName
                };
                const newSlides = [...get().slides, newSlide]
                    .sort((a, b) => a.order - b.order)
                    .map((s, i) => ({ ...s, order: i }));
                set({ slides: newSlides });
                helpers.broadcastSlides(newSlides);
            } catch (err) {
                console.error('[EditorStore] copySlide failed:', err);
            }
        },

        deleteSlide: async (slideId: string) => {
            const { slides, commitId, activeSlideId } = get();
            if (!commitId || slides.length <= 1) return;

            try {
                const ok = await $deleteSlideFromCommit({ data: { commitId, slideId } });
                if (!ok) return;

                const newSlides = slides
                    .filter((s) => s.id !== slideId)
                    .sort((a, b) => a.order - b.order)
                    .map((s, i) => ({ ...s, order: i }));
                set({ slides: newSlides });
                helpers.broadcastSlides(newSlides);

                if (activeSlideId === slideId && newSlides.length > 0) {
                    set({ activeSlideId: newSlides[0].id });
                }
            } catch (err) {
                console.error('[EditorStore] deleteSlide failed:', err);
            }
        },

        renameSlide: (slideId: string, name: string) => {
            const newSlides = get().slides.map((s) => (s.id === slideId ? { ...s, name } : s));
            set({ slides: newSlides });
            helpers.broadcastSlides(newSlides);
            get().markDirty();
        },

        reorderSlides: (slides: Slide[]) => {
            const normalized = slides.map((slide, index) => ({ ...slide, order: index }));
            set({ slides: normalized });
            helpers.broadcastSlides(normalized);
            get().markDirty();
        },

        toggleSlideSelection: (id: string, isShiftClick: boolean, isCtrlClick: boolean) => {
            const { slides, lastSelectedSlide } = get();
            if (isShiftClick && lastSelectedSlide) {
                const lastIndex = slides.findIndex((s) => s.id === lastSelectedSlide);
                const currentIndex = slides.findIndex((s) => s.id === id);
                const inBetween = slides.slice(
                    Math.min(lastIndex, currentIndex),
                    Math.max(lastIndex, currentIndex) + 1
                );
                set((s) => ({
                    selectedSlides: [
                        ...new Set([...s.selectedSlides, ...inBetween.map((s) => s.id)])
                    ]
                }));
            } else if (isCtrlClick) {
                set((s) => {
                    const newSelection = [...s.selectedSlides];
                    const index = newSelection.indexOf(id);
                    if (index > -1) {
                        newSelection.splice(index, 1);
                    } else {
                        newSelection.push(id);
                    }
                    return { selectedSlides: newSelection };
                });
            } else {
                set({ selectedSlides: [id] });
            }
            set({ lastSelectedSlide: id });
        }
    };
}
