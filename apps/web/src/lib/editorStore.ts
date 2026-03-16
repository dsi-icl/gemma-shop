import { throttle } from '@tanstack/pacer';
import { create } from 'zustand';

import { $copySlideInCommit, $deleteSlideFromCommit, $getCommit } from '../server/projects.fns';
import { projectAssetsQueryOptions } from '../server/projects.queries';
import { EditorEngine } from './editorEngine';
import type { ConnectionStatus } from './reconnectingWs';
import type { Layer, LayerWithEditorState, Slide } from './types';

/** Generate a 24-char hex string mimicking a MongoDB ObjectId (timestamp + random). */
function generateSlideId(): string {
    const timestamp = Math.floor(Date.now() / 1000)
        .toString(16)
        .padStart(8, '0');
    const random = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    return timestamp + random;
}

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/** Send a layer update to the server, preserving video playback state */
const sendLayerUpdate = throttle(
    (layer: LayerWithEditorState, origin: string) => {
        const engine = EditorEngine.getInstance();
        if (layer.type === 'video') {
            engine.sendJSON({
                type: 'upsert_layer',
                origin,
                layer: { ...layer, playback: engine.getPlayback(layer.numericId) || layer.playback }
            });
        } else {
            engine.sendJSON({ type: 'upsert_layer', origin, layer });
        }
    },
    { wait: 100 }
);

/** Broadcast slide list metadata to the bus for persistence + relay to other editors/controllers */
function broadcastSlides(slides: Slide[]) {
    const engine = EditorEngine.getInstance();
    const commitId = useEditorStore.getState().commitId;
    if (!commitId) return;
    engine.sendJSON({
        type: 'update_slides',
        commitId,
        slides: slides.map((s) => ({ id: s.id, order: s.order, name: s.name }))
    });
}

interface EditorState {
    // ── State ──
    projectId: string | null;
    layers: LayerWithEditorState[];
    selectedLayerIds: string[];
    nextId: number;
    nextZIndex: number;
    slides: Slide[];
    activeSlideId: string | null;
    selectedSlides: string[];
    lastSelectedSlide: string | null;
    lastSelectedLayerId: string | null;
    showSpacePreview: boolean;
    showGrid: boolean;
    showInk: boolean;
    isDrawing: boolean;
    isSnapping: boolean;
    inkColour: string;
    inkWidth: number;
    inkDash: number[];
    shapeFill: string;
    shapeStroke: string;

    // ── Wall binding ──
    boundWallId: string | null;

    // ── Connection state ──
    connectionStatus: ConnectionStatus;

    // ── Commit tracking ──
    commitId: string | null;

    // ── Save pipeline state ──
    saveStatus: SaveStatus;
    headCommitId: string | null;

    // ── Pure state mutations ──
    loadProject: (projectId: string, commitId: string, slideId: string) => Promise<void>;
    hydrate: (layers: LayerWithEditorState[]) => void;
    upsertLayer: (layer: LayerWithEditorState) => void;
    removeLayer: (numericId: number) => void;
    updateProgress: (numericId: number, progress: number) => void;
    updateLayerConfig: (numericId: number, config: Layer['config']) => void;
    setSlides: (slides: Slide[]) => void;
    setActiveSlideId: (id: string | null) => void;
    setSelectedSlides: (ids: string[]) => void;
    setInkColour: (color: string) => void;
    setInkWidth: (width: number) => void;
    setInkDash: (dash: number[]) => void;
    setShapeFill: (fill: string) => void;

    // ── Save actions ──
    markDirty: () => void;
    saveProject: (message: string) => void;

    // ── Allocators ──
    allocateId: () => number;
    allocateZIndex: () => number;

    // ── Side-effect actions (mutate store + send to engine) ──
    deleteSelectedLayer: () => void;
    bringToFront: () => void;
    sendToBack: () => void;
    addTextLayer: () => void;
    addMapLayer: () => void;
    addShapeLayer: (shape: 'rectangle' | 'circle') => void;
    addInkLayer: (line: Array<number>) => void;
    clearStage: () => void;
    reboot: () => void;
    reorderLayers: (layers: LayerWithEditorState[]) => void;
    addSlide: () => void;
    copySlide: (slide: Slide) => Promise<void>;
    deleteSlide: (slideId: string) => Promise<void>;
    renameSlide: (slideId: string, name: string) => void;
    reorderSlides: (slides: Slide[]) => void;
    deselectAllLayers: () => void;
    toggleSlideSelection: (id: string, isShiftClick: boolean, isCtrlClick: boolean) => void;
    toggleLayerSelection: (id: string, isShiftClick: boolean, isCtrlClick: boolean) => void;
    toggleGrid: () => void;
    toggleInk: () => void;
    toggleDrawing: () => void;
    toggleSnapping: () => void;
    toggleSpacePreview: () => void;
}

export const useEditorStore = create<EditorState>()((set, get) => ({
    projectId: null,
    layers: [],
    selectedLayerIds: [],
    nextId: 1,
    nextZIndex: 10,
    slides: [],
    activeSlideId: null,
    selectedSlides: [],
    copiedSlide: null,
    lastSelectedSlide: null,
    lastSelectedLayerId: null,
    showSpacePreview: false,
    showGrid: true,
    showInk: true,
    isDrawing: false,
    isSnapping: true,
    inkColour: '#ff0000',
    inkWidth: 10,
    inkDash: [],
    shapeFill: '#ff0000',
    shapeStroke: '#000000',

    // ── Wall binding ──
    boundWallId: null,

    // ── Connection state ──
    connectionStatus: 'connecting' as ConnectionStatus,

    // ── Commit tracking ──
    commitId: null,

    // ── Save pipeline state ──
    saveStatus: 'idle',
    headCommitId: null,

    // ── Pure state mutations ──────────────────────────────────────────────
    loadProject: async (projectId, commitId, slideId) => {
        set({
            projectId,
            commitId,
            layers: [],
            slides: [],
            activeSlideId: null,
            saveStatus: 'idle',
            headCommitId: null
        });

        const engine = EditorEngine.getInstance();

        // Clear any stale buffered hydration before joining
        engine.clearBufferedHydration();

        // Join the scope — bus responds with hydrate (empty if fresh, populated if existing)
        engine.joinScope(projectId, commitId, slideId);
        const hydrate = await engine.waitForHydrate();

        // Always fetch the commit for slide list metadata
        const commit = await $getCommit({ data: { id: commitId } });
        if (commit?.content?.slides) {
            const commitSlides = commit.content.slides as Array<{
                id: string;
                order: number;
                name?: string;
                layers: LayerWithEditorState[];
            }>;
            const slides: Slide[] = commitSlides.map((s, i) => ({
                id: s.id,
                order: s.order ?? i,
                name: s.name || `Slide ${(s.order ?? i) + 1}`
            }));
            set({ slides, headCommitId: commitId });
        }

        if (hydrate.layers.length > 0) {
            // Scope already has state (another editor, or reconnection) — trust bus
            get().hydrate(hydrate.layers as LayerWithEditorState[]);
            set({ activeSlideId: slideId });
        } else {
            // Fresh scope — seed from commit data
            const commitSlides = commit?.content?.slides as
                | Array<{ id: string; order: number; layers: LayerWithEditorState[] }>
                | undefined;
            const activeSlide = commitSlides?.find((s) => s.id === slideId);
            if (activeSlide) {
                get().hydrate(activeSlide.layers as LayerWithEditorState[]);
                set({ activeSlideId: slideId });
                engine.sendJSON({
                    type: 'seed_scope',
                    layers: activeSlide.layers as LayerWithEditorState[]
                });
            }
        }
    },

    hydrate: (layers) => {
        const maxId = layers.length > 0 ? Math.max(...layers.map((l) => l.numericId)) : 0;
        const maxZ = layers.length > 0 ? Math.max(...layers.map((l) => l.config.zIndex)) : 0;
        set({ layers, nextId: maxId + 5, nextZIndex: maxZ + 5 });
    },

    upsertLayer: (layer) =>
        set((s) => {
            const isNew = !s.layers.find((l) => l.numericId === layer.numericId);
            let nextId = s.nextId;
            let nextZIndex = s.nextZIndex;

            // Multiple editors may interfere — build 5-degree tolerance
            if (layer.numericId > s.nextId) nextId = layer.numericId + 5;
            if (isNew) {
                nextZIndex =
                    (layer.config.zIndex ?? 0) > s.nextZIndex
                        ? layer.config.zIndex + 5
                        : s.nextZIndex + 5;
            }

            const filtered = s.layers.filter((l) => l.numericId !== layer.numericId);
            return { layers: [...filtered, layer], nextId, nextZIndex };
        }),

    removeLayer: (numericId) => {
        set((s) => ({
            layers: s.layers.filter((l) => l.numericId !== numericId),
            selectedLayerIds: s.selectedLayerIds.filter((id) => id !== numericId.toString())
        }));
        const engine = EditorEngine.getInstance();
        engine.sendJSON({ type: 'delete_layer', numericId });
        get().markDirty();
    },

    updateProgress: (numericId, progress) =>
        set((s) => ({
            layers: s.layers.map((l) => (l.numericId === numericId ? { ...l, progress } : l))
        })),

    updateLayerConfig: (numericId, config) => {
        set((s) => ({
            layers: s.layers.map((l) => (l.numericId === numericId ? { ...l, config } : l))
        }));
        get().markDirty();
    },

    deselectAllLayers: () => {
        set(() => ({
            selectedLayerIds: []
        }));
    },

    toggleLayerSelection: (id, isShiftClick, isCtrlClick) => {
        const { layers, lastSelectedLayerId } = get();
        if (isShiftClick && lastSelectedLayerId) {
            const lastIndex = layers.findIndex(
                (l) => l.numericId.toString() === lastSelectedLayerId
            );
            const currentIndex = layers.findIndex((l) => l.numericId.toString() === id);
            const inBetween = layers.slice(
                Math.min(lastIndex, currentIndex),
                Math.max(lastIndex, currentIndex) + 1
            );
            set((s) => ({
                selectedLayerIds: [
                    ...new Set([
                        ...s.selectedLayerIds,
                        ...inBetween.map((l) => l.numericId.toString())
                    ])
                ]
            }));
        } else if (isCtrlClick) {
            set((s) => {
                const newSelection = [...s.selectedLayerIds];
                const index = newSelection.indexOf(id);
                if (index > -1) {
                    newSelection.splice(index, 1);
                } else {
                    newSelection.push(id);
                }
                return { selectedLayerIds: newSelection };
            });
        } else {
            const selectedLayer = layers.find((l) => l.numericId.toString() === id);
            const newState: Partial<EditorState> = {
                selectedLayerIds: [id]
            };
            if (selectedLayer?.type === 'ink') {
                newState.inkColour = selectedLayer.color;
                newState.inkDash = selectedLayer.dash;
                newState.inkWidth = selectedLayer.width;
            }
            if (selectedLayer?.type === 'shape') {
                newState.inkColour = selectedLayer.strokeColor;
                newState.inkDash = selectedLayer.strokeDash;
                newState.inkWidth = selectedLayer.strokeWidth;
                newState.shapeFill = selectedLayer.fill;
            }
            set(newState);
        }
        set({ lastSelectedLayerId: id });
    },

    setSlides: (slides) => set({ slides }),
    setActiveSlideId: (id) => set({ activeSlideId: id }),
    setSelectedSlides: (ids) => set({ selectedSlides: ids }),
    setInkColour: (color) => {
        set((s) => {
            const newState: Partial<EditorState> = { inkColour: color };
            if (s.selectedLayerIds.length > 0) {
                const numericId = parseInt(s.selectedLayerIds[0]);
                newState.layers = s.layers.map((l) => {
                    if (l.numericId === numericId) {
                        if (l.type === 'ink') return { ...l, color };
                        if (l.type === 'shape') return { ...l, strokeColor: color };
                    }
                    return l;
                });
                const newLayerState = s.layers.find((l) => l.numericId === numericId);
                if (newLayerState) {
                    sendLayerUpdate(newLayerState, 'setInkColour');
                }
            }
            return newState;
        });
        get().markDirty();
    },
    setInkWidth: (width) => {
        set((s) => {
            const newState: Partial<EditorState> = { inkWidth: width };
            if (s.selectedLayerIds.length > 0) {
                const numericId = parseInt(s.selectedLayerIds[0]);
                newState.layers = s.layers.map((l) => {
                    if (l.numericId === numericId) {
                        if (l.type === 'ink') return { ...l, width };
                        if (l.type === 'shape') return { ...l, strokeWidth: width };
                    }
                    return l;
                });
                const newLayerState = s.layers.find((l) => l.numericId === numericId);
                if (newLayerState) {
                    sendLayerUpdate(newLayerState, 'setInkWidth');
                }
            }
            return newState;
        });
        get().markDirty();
    },
    setInkDash: (dash) => {
        set((s) => {
            const newState: Partial<EditorState> = { inkDash: dash };
            if (s.selectedLayerIds.length > 0) {
                const numericId = parseInt(s.selectedLayerIds[0]);
                newState.layers = s.layers.map((l) => {
                    if (l.numericId === numericId) {
                        if (l.type === 'ink') return { ...l, dash };
                        if (l.type === 'shape') return { ...l, strokeDash: dash };
                    }
                    return l;
                });
                const newLayerState = s.layers.find((l) => l.numericId === numericId);
                if (newLayerState) {
                    sendLayerUpdate(newLayerState, 'setInkDash');
                }
            }
            return newState;
        });
        get().markDirty();
    },
    setShapeFill: (fill) => {
        set((s) => {
            const newState: Partial<EditorState> = { shapeFill: fill };
            if (s.selectedLayerIds.length > 0) {
                const numericId = parseInt(s.selectedLayerIds[0]);
                newState.layers = s.layers.map((l) =>
                    l.numericId === numericId ? { ...l, fill } : l
                );
                const newLayerState = s.layers.find((l) => l.numericId === numericId);
                if (newLayerState) {
                    sendLayerUpdate(newLayerState, 'setShapeFill');
                }
            }
            return newState;
        });
        get().markDirty();
    },

    // ── Save pipeline ─────────────────────────────────────────────────────

    markDirty: () => {
        const { saveStatus } = get();
        if (saveStatus !== 'saving') {
            set({ saveStatus: 'dirty' });
            // Notify bus that scope is dirty (bus handles auto-save)
            const engine = EditorEngine.getInstance();
            engine.sendDirty();
        }
    },

    saveProject: (message) => {
        set({ saveStatus: 'saving' });
        const engine = EditorEngine.getInstance();
        engine.requestSave(message);
    },

    // ── Allocators ────────────────────────────────────────────────────────

    allocateId: () => {
        const id = get().nextId;
        set({ nextId: id + 1 });
        return id;
    },

    allocateZIndex: () => {
        const z = get().nextZIndex;
        set({ nextZIndex: z + 1 });
        return z;
    },

    // ── Side-effect actions ───────────────────────────────────────────────

    deleteSelectedLayer: () => {
        const { selectedLayerIds } = get();
        if (!selectedLayerIds.length) return;
        const numericId = parseInt(selectedLayerIds[0]);
        const engine = EditorEngine.getInstance();
        engine.sendJSON({ type: 'delete_layer', numericId });
        set((s) => ({
            layers: s.layers.filter((l) => l.numericId !== numericId),
            selectedLayerIds: []
        }));
        get().markDirty();
    },

    bringToFront: () => {
        const s = get();
        if (!s.selectedLayerIds.length) return;
        const numericId = parseInt(s.selectedLayerIds[0]);
        const layer = s.layers.find((l) => l.numericId === numericId);
        if (!layer) return;

        const alreadyOnTop = layer.config.zIndex === s.nextZIndex;
        const newZIndex = alreadyOnTop ? layer.config.zIndex : s.nextZIndex;
        const updatedConfig = { ...layer.config, zIndex: newZIndex };
        const updatedLayer = { ...layer, config: updatedConfig };

        set({
            layers: s.layers.map((l) => (l.numericId === numericId ? updatedLayer : l)),
            nextZIndex: alreadyOnTop ? s.nextZIndex : s.nextZIndex + 1
        });

        sendLayerUpdate(updatedLayer, 'bringToFront');
        get().markDirty();
    },

    sendToBack: () => {
        const s = get();
        if (!s.selectedLayerIds.length) return;
        const numericId = parseInt(s.selectedLayerIds[0]);
        const layer = s.layers.find((l) => l.numericId === numericId);
        if (!layer) return;

        const minZIndex = Math.min(...s.layers.map((l) => l.config.zIndex));
        const newZIndex = layer.config.zIndex === minZIndex ? minZIndex : minZIndex - 1;
        const updatedConfig = { ...layer.config, zIndex: newZIndex };
        const updatedLayer = { ...layer, config: updatedConfig };

        set({
            layers: s.layers.map((l) => (l.numericId === numericId ? updatedLayer : l))
        });

        sendLayerUpdate(updatedLayer, 'sendToBack');
        get().markDirty();
    },

    addTextLayer: () => {
        const { allocateId, allocateZIndex } = get();
        const numericId = allocateId();
        const zIndex = allocateZIndex();

        const newLayer: LayerWithEditorState = {
            numericId,
            type: 'text',
            config: {
                cx: 1920 / 2,
                cy: 1080 / 2,
                width: 1920,
                height: 1080,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                zIndex
            },
            textProto: '# Hello Wall\nEdit this text!'
        };

        set((s) => ({
            layers: [...s.layers, newLayer],
            selectedLayerIds: [numericId.toString()]
        }));
        const engine = EditorEngine.getInstance();
        engine.sendJSON({
            type: 'upsert_layer',
            origin: 'addTextLayer',
            layer: newLayer
        });
        get().markDirty();
    },

    addMapLayer: () => {
        const { allocateId, allocateZIndex } = get();
        const numericId = allocateId();
        const zIndex = allocateZIndex();

        const newLayer: LayerWithEditorState = {
            numericId,
            type: 'map',
            config: {
                cx: 400,
                cy: 300,
                width: 300,
                height: 200,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                zIndex
            },
            view: {
                latitude: 37.7751,
                longitude: -122.4193,
                zoom: 11,
                bearing: 0,
                pitch: 0
            }
        };

        set((s) => ({
            layers: [...s.layers, newLayer],
            selectedLayerIds: [numericId.toString()]
        }));
        const engine = EditorEngine.getInstance();
        engine.sendJSON({
            type: 'upsert_layer',
            origin: 'addMapLayer',
            layer: newLayer
        });
        get().markDirty();
    },

    addShapeLayer: (shape) => {
        const { allocateId, allocateZIndex, inkColour, inkDash, inkWidth } = get();
        const numericId = allocateId();
        const zIndex = allocateZIndex();

        const newLayer: LayerWithEditorState = {
            numericId,
            type: 'shape',
            shape,
            config: {
                cx: 1920 / 2,
                cy: 1080 / 2,
                width: 200,
                height: 200,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                zIndex
            },
            fill: 'transparent',
            strokeColor: inkColour,
            strokeDash: inkDash,
            strokeWidth: inkWidth
        };

        set((s) => ({
            layers: [...s.layers, newLayer],
            selectedLayerIds: [numericId.toString()]
        }));
        const engine = EditorEngine.getInstance();
        engine.sendJSON({
            type: 'upsert_layer',
            origin: 'addShapeLayer',
            layer: newLayer
        });
        get().markDirty();
    },

    addInkLayer: (line) => {
        const { allocateId, allocateZIndex, inkColour, inkWidth, inkDash } = get();
        const numericId = allocateId();
        const zIndex = allocateZIndex();

        let minX: number | null = null;
        let minY: number | null = null;
        let maxX: number | null = null;
        let maxY: number | null = null;
        let svgPoints = [];
        for (let i = 0; i < line.length; i += 2) {
            const x = line[i];
            const y = line[i + 1];
            if (minX === null || minY === null || maxX === null || maxY === null) {
                minX = x;
                minY = y;
                maxX = x;
                maxY = y;
            }
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            svgPoints.push(`${line[i]},${line[i + 1]}`);
        }
        if (minX === null || minY === null || maxX === null || maxY === null) return null;
        const width = Math.round(maxX - minX);
        const height = Math.round(maxY - minY);

        const newLayer: LayerWithEditorState = {
            numericId,
            type: 'ink',
            config: {
                cx: minX,
                cy: minY,
                width,
                height,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                zIndex
            },
            line: line.map((p) => Math.round(p)),
            color: inkColour,
            width: inkWidth,
            dash: inkDash
        };
        set((s) => ({
            layers: [...s.layers, newLayer],
            selectedLayerIds: [numericId.toString()]
        }));
        const engine = EditorEngine.getInstance();
        engine.sendJSON({
            type: 'upsert_layer',
            origin: 'addInkLayer',
            layer: newLayer
        });
        get().markDirty();
    },

    clearStage: () => {
        const engine = EditorEngine.getInstance();
        engine.sendJSON({ type: 'clear_stage' });
        set({ layers: [], selectedLayerIds: [] });
        get().markDirty();
    },
    reboot: () => {
        const engine = EditorEngine.getInstance();
        engine.sendJSON({ type: 'reboot' });
        set({ selectedLayerIds: [] });
    },
    reorderLayers: (layers) => {
        const updatedLayers = layers.map((layer, index) => ({
            ...layer,
            config: {
                ...layer.config,
                zIndex: index
            }
        }));

        set({ layers: updatedLayers });

        updatedLayers.forEach((layer) => {
            sendLayerUpdate(layer, 'reorderLayers');
        });
        get().markDirty();
    },

    addSlide: () => {
        const newSlides = [
            ...get().slides,
            { id: generateSlideId(), name: 'New Slide', order: get().slides.length }
        ];
        set({ slides: newSlides });
        broadcastSlides(newSlides);
        get().markDirty();
    },

    copySlide: async (slide) => {
        const { commitId } = get();
        if (!commitId) return;

        const newSlideId = generateSlideId();
        const newSlideName = `${slide.name} (Copy)`;

        try {
            // Server-side: copies layers in the commit doc with fresh numericIds
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
            broadcastSlides(newSlides);
        } catch (err) {
            console.error('[EditorStore] copySlide failed:', err);
        }
    },

    deleteSlide: async (slideId) => {
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
            broadcastSlides(newSlides);

            // If we deleted the active slide, switch to the first remaining one
            if (activeSlideId === slideId && newSlides.length > 0) {
                set({ activeSlideId: newSlides[0].id });
            }
        } catch (err) {
            console.error('[EditorStore] deleteSlide failed:', err);
        }
    },

    renameSlide: (slideId, name) => {
        const newSlides = get().slides.map((s) => (s.id === slideId ? { ...s, name } : s));
        set({ slides: newSlides });
        broadcastSlides(newSlides);
        get().markDirty();
    },

    reorderSlides: (slides) => {
        set({ slides });
        broadcastSlides(slides);
        get().markDirty();
    },

    toggleSlideSelection: (id, isShiftClick, isCtrlClick) => {
        const { slides, lastSelectedSlide } = get();
        if (isShiftClick && lastSelectedSlide) {
            const lastIndex = slides.findIndex((s) => s.id === lastSelectedSlide);
            const currentIndex = slides.findIndex((s) => s.id === id);
            const inBetween = slides.slice(
                Math.min(lastIndex, currentIndex),
                Math.max(lastIndex, currentIndex) + 1
            );
            set((s) => ({
                selectedSlides: [...new Set([...s.selectedSlides, ...inBetween.map((s) => s.id)])]
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
    },
    toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
    toggleInk: () => set((s) => ({ showInk: !s.showInk })),
    toggleDrawing: () =>
        set((s) => ({
            isDrawing: !s.isDrawing,
            selectedLayerIds: !s.isDrawing ? [] : s.selectedLayerIds
        })),
    toggleSnapping: () => set((s) => ({ isSnapping: !s.isSnapping })),
    toggleSpacePreview: () => set((s) => ({ showSpacePreview: !s.showSpacePreview }))
}));

// ── Wire EditorEngine → Store (runs once on module load) ──────────────────
// The engine pushes WebSocket JSON messages directly into the store.
// No React components needed as a bridge.
const engine = EditorEngine.getInstance();
engine.subscribeToJson((data) => {
    const store = useEditorStore.getState();
    if (data.type === 'hydrate') {
        store.hydrate(data.layers);
    } else if (data.type === 'upsert_layer') {
        store.upsertLayer(data.layer);
    } else if (data.type === 'delete_layer') {
        // Remote delete — only update local state, don't re-broadcast
        useEditorStore.setState((s) => ({
            layers: s.layers.filter((l) => l.numericId !== data.numericId),
            selectedLayerIds: s.selectedLayerIds.filter((id) => id !== data.numericId.toString())
        }));
    } else if (data.type === 'processing_progress') {
        store.updateProgress(data.numericId, data.progress);
    } else if (data.type === 'slides_updated') {
        // Another editor changed slide metadata — update our list without touching layers
        if (data.commitId === store.commitId) {
            store.setSlides(
                data.slides.map((s: { id: string; order: number; name: string }) => ({
                    id: s.id,
                    order: s.order,
                    name: s.name
                }))
            );
        }
    } else if (data.type === 'asset_added') {
        // New asset uploaded (by any editor or mobile) — invalidate React Query cache
        console.log(
            `[EditorStore] asset_added received: projectId=${data.projectId}, store.projectId=${store.projectId}`
        );
        if (data.projectId === store.projectId) {
            import('~/router').then(({ queryClient }) => {
                console.log(`[EditorStore] Invalidating asset query for project ${data.projectId}`);
                queryClient.invalidateQueries({
                    queryKey: projectAssetsQueryOptions(data.projectId).queryKey
                });
            });
        }
    }
});

// Wire connection status into the store
engine.onConnectionStatusChange((status) => {
    useEditorStore.setState({ connectionStatus: status });
});

// Wire save responses from the bus back into the store
engine.subscribeToSaveResponse((data) => {
    const store = useEditorStore.getState();
    if (data.success) {
        useEditorStore.setState({
            saveStatus: 'saved',
            headCommitId: data.commitId ?? store.headCommitId
        });
        // Reset to idle after brief "saved" flash
        setTimeout(() => {
            if (useEditorStore.getState().saveStatus === 'saved') {
                useEditorStore.setState({ saveStatus: 'idle' });
            }
        }, 2000);
    } else {
        console.error('Save failed:', data.error);
        useEditorStore.setState({ saveStatus: 'error' });
        // Allow retry after 3s
        setTimeout(() => {
            if (useEditorStore.getState().saveStatus === 'error') {
                useEditorStore.setState({ saveStatus: 'dirty' });
            }
        }, 3000);
    }
});
