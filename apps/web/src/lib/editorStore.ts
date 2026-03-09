import { create } from 'zustand';

import { EditorEngine } from './editorEngine';
import type { Layer, LayerWithEditorState } from './types';

/** Send a layer update to the server, preserving video playback state */
function sendLayerUpdate(layer: LayerWithEditorState, origin: string) {
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
}

interface EditorState {
    // ── State ──
    layers: LayerWithEditorState[];
    selectedId: string | null;
    nextId: number;
    nextZIndex: number;

    // ── Pure state mutations ──
    hydrate: (layers: LayerWithEditorState[]) => void;
    upsertLayer: (layer: LayerWithEditorState) => void;
    removeLayer: (numericId: number) => void;
    updateProgress: (numericId: number, progress: number) => void;
    updateLayerConfig: (numericId: number, config: Layer['config']) => void;
    select: (id: string | null) => void;

    // ── Allocators ──
    allocateId: () => number;
    allocateZIndex: () => number;

    // ── Side-effect actions (mutate store + send to engine) ──
    deleteSelectedLayer: () => void;
    bringToFront: () => void;
    sendToBack: () => void;
    addTextLayer: () => void;
    addMapLayer: () => void;
    clearStage: () => void;
    reboot: () => void;
}

export const useEditorStore = create<EditorState>()((set, get) => ({
    layers: [],
    selectedId: null,
    nextId: 1,
    nextZIndex: 10,

    // ── Pure state mutations ──────────────────────────────────────────────

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

    removeLayer: (numericId) =>
        set((s) => ({
            layers: s.layers.filter((l) => l.numericId !== numericId),
            selectedId: s.selectedId === numericId.toString() ? null : s.selectedId
        })),

    updateProgress: (numericId, progress) =>
        set((s) => ({
            layers: s.layers.map((l) => (l.numericId === numericId ? { ...l, progress } : l))
        })),

    updateLayerConfig: (numericId, config) =>
        set((s) => ({
            layers: s.layers.map((l) => (l.numericId === numericId ? { ...l, config } : l))
        })),

    select: (id) => set({ selectedId: id }),

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
        const { selectedId } = get();
        if (!selectedId) return;
        const numericId = parseInt(selectedId);
        EditorEngine.getInstance().sendJSON({ type: 'delete_layer', numericId });
        set((s) => ({
            layers: s.layers.filter((l) => l.numericId !== numericId),
            selectedId: null
        }));
    },

    bringToFront: () => {
        const s = get();
        if (!s.selectedId) return;
        const numericId = parseInt(s.selectedId);
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
    },

    sendToBack: () => {
        const s = get();
        if (!s.selectedId) return;
        const numericId = parseInt(s.selectedId);
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
    },

    addTextLayer: () => {
        const { allocateId, allocateZIndex } = get();
        const numericId = allocateId();
        const zIndex = allocateZIndex();

        const newLayer: LayerWithEditorState = {
            numericId,
            type: 'text',
            config: {
                cx: 400,
                cy: 300,
                width: 100,
                height: 100,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                zIndex
            },
            markdown: '# Hello Wall\nEdit this text!'
        };

        set((s) => ({
            layers: [...s.layers, newLayer],
            selectedId: numericId.toString()
        }));
        EditorEngine.getInstance().sendJSON({
            type: 'upsert_layer',
            origin: 'addTextLayer',
            layer: newLayer
        });
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
            selectedId: numericId.toString()
        }));
        EditorEngine.getInstance().sendJSON({
            type: 'upsert_layer',
            origin: 'addMapLayer',
            layer: newLayer
        });
    },

    clearStage: () => {
        EditorEngine.getInstance().sendJSON({ type: 'clear_stage' });
        set({ layers: [], selectedId: null });
    },

    reboot: () => {
        EditorEngine.getInstance().sendJSON({ type: 'reboot' });
        set({ selectedId: null });
    }
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
    } else if (data.type === 'processing_progress') {
        store.updateProgress(data.numericId, data.progress);
    }
});
