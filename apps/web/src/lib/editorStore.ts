import { throttle } from '@tanstack/pacer';
import { create } from 'zustand';

import {
    $copySlideInCommit,
    $deleteSlideFromCommit,
    $getCommit,
    $getProject
} from '../server/projects.fns';
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

export interface EditorState {
    // ── State ──
    projectId: string | null;
    projectName: string | null;
    parentSaveMessage: string | null;
    layers: Map<number, LayerWithEditorState>;
    selectedLayerIds: string[];
    slides: Slide[];
    activeSlideId: string | null;
    selectedSlides: string[];
    lastSelectedSlide: string | null;
    lastSelectedLayerId: string | null;
    showSpacePreview: boolean;
    showGrid: boolean;
    isDrawing: boolean;
    isSnapping: boolean;
    strokeColor: string;
    strokeWidth: number;
    strokeDash: number[];
    shapeFill: string;
    shapeStroke: string;
    editingTextLayerId: number | null;

    // ── Wall binding ──
    boundWallId: string | null;
    wallNodeCounts: Record<string, number>;

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
    setStrokeColor: (color: string) => void;
    setStrokeWidth: (width: number) => void;
    setStrokeDash: (dash: number[]) => void;
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
    addWebLayer: () => void;
    addLineLayer: (line: Array<number>) => void;
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
    toggleLayerVisibility: (numericId: number) => void;
    toggleGrid: () => void;
    toggleDrawing: () => void;
    toggleSnapping: () => void;
    toggleSpacePreview: () => void;
    startTextEditing: (numericId: number) => void;
    stopTextEditing: () => void;
}

export type EditorStateCreator = ReturnType<ReturnType<typeof create<EditorState>>>;

let _nextId = 1;
let _nextZIndex = 10;

export const useEditorStore =
    typeof window !== 'undefined' && window.__EDITOR_STORE__
        ? window.__EDITOR_STORE__
        : create<EditorState>()((set, get) => {
              /** Send a layer update to the server, preserving video playback state */
              const sendLayerUpdate = throttle(
                  (layer: LayerWithEditorState, origin: string) => {
                      const engine = EditorEngine.getInstance();
                      if (layer.type === 'video') {
                          engine.sendJSON({
                              type: 'upsert_layer',
                              origin,
                              layer: {
                                  ...layer,
                                  playback: engine.getPlayback(layer.numericId) || layer.playback
                              }
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
                  const commitId = get().commitId;
                  if (!commitId) return;
                  engine.sendJSON({
                      type: 'update_slides',
                      commitId,
                      slides: slides.map((s) => ({ id: s.id, order: s.order, name: s.name }))
                  });
              }

              return {
                  projectId: null,
                  projectName: null,
                  parentSaveMessage: null,
                  layers: new Map(),
                  selectedLayerIds: [],
                  slides: [],
                  activeSlideId: null,
                  selectedSlides: [],
                  lastSelectedSlide: null,
                  lastSelectedLayerId: null,
                  showSpacePreview: false,
                  showGrid: true,
                  isDrawing: false,
                  isSnapping: true,
                  strokeColor: '#ff0000',
                  strokeWidth: 10,
                  strokeDash: [],
                  shapeFill: '#ff0000',
                  shapeStroke: '#000000',
                  editingTextLayerId: null,

                  // ── Wall binding ──
                  boundWallId: null,
                  wallNodeCounts: {},

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
                          layers: new Map(),
                          slides: [],
                          activeSlideId: null,
                          saveStatus: 'idle',
                          headCommitId: null
                      });

                      // Get project information
                      const project = await $getProject({ data: { id: projectId } });
                      if (project) {
                          set({ projectName: project.name });
                      }

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
                      if (commit.parentId) {
                          const lastSavedCommit = await $getCommit({
                              data: { id: commit.parentId }
                          });
                          if (lastSavedCommit) {
                              set({ parentSaveMessage: lastSavedCommit.message });
                          }
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
                      _nextId = layers.reduce((max, l) => Math.max(max, l.numericId), 0) + 5;
                      _nextZIndex =
                          layers.reduce((max, l) => Math.max(max, l.config.zIndex), 0) + 5;
                      set({ layers: new Map(layers.map((l) => [l.numericId, l])) });
                  },

                  upsertLayer: (layer) =>
                      set((s) => {
                          const isNew = !s.layers.has(layer.numericId);

                          // Multiple editors may interfere — build 5-degree tolerance
                          if (layer.numericId >= _nextId) _nextId = layer.numericId + 5;
                          if (isNew) {
                              _nextZIndex =
                                  (layer.config.zIndex ?? 0) >= _nextZIndex
                                      ? layer.config.zIndex + 5
                                      : _nextZIndex + 5;
                          }

                          const newLayers = new Map(s.layers);
                          newLayers.set(layer.numericId, layer);
                          return { layers: newLayers };
                      }),

                  removeLayer: (numericId) => {
                      set((s) => {
                          const newLayers = new Map(s.layers);
                          newLayers.delete(numericId);
                          return {
                              layers: newLayers,
                              selectedLayerIds: s.selectedLayerIds.filter(
                                  (id) => id !== numericId.toString()
                              )
                          };
                      });
                      const engine = EditorEngine.getInstance();
                      engine.sendJSON({ type: 'delete_layer', numericId });
                      get().markDirty();
                  },

                  updateProgress: (numericId, progress) =>
                      set((s) => {
                          const layer = s.layers.get(numericId);
                          if (!layer) return s;
                          const newLayers = new Map(s.layers);
                          newLayers.set(numericId, { ...layer, progress });
                          return { layers: newLayers };
                      }),

                  updateLayerConfig: (numericId, config) => {
                      set((s) => {
                          const layer = s.layers.get(numericId);
                          if (!layer) return s;
                          const newLayers = new Map(s.layers);
                          newLayers.set(numericId, { ...layer, config });
                          return { layers: newLayers };
                      });
                      get().markDirty();
                  },

                  toggleLayerVisibility: (numericId) => {
                      const layer = get().layers.get(numericId);
                      if (!layer) return;
                      const updatedLayer = {
                          ...layer,
                          config: { ...layer.config, visible: !layer.config.visible }
                      };
                      set((s) => {
                          const newLayers = new Map(s.layers);
                          newLayers.set(numericId, updatedLayer);
                          return { layers: newLayers };
                      });
                      const engine = EditorEngine.getInstance();
                      engine.sendJSON({ type: 'upsert_layer', layer: updatedLayer });
                      get().markDirty();
                  },

                  deselectAllLayers: () => {
                      set(() => ({
                          selectedLayerIds: []
                      }));
                  },

                  toggleLayerSelection: (id, isShiftClick, isCtrlClick) => {
                      const { layers, lastSelectedLayerId } = get();
                      const layersArray = Array.from(layers.values());
                      if (isShiftClick && lastSelectedLayerId) {
                          const lastIndex = layersArray.findIndex(
                              (l) => l.numericId.toString() === lastSelectedLayerId
                          );
                          const currentIndex = layersArray.findIndex(
                              (l) => l.numericId.toString() === id
                          );
                          const inBetween = layersArray.slice(
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
                          const selectedLayer = layers.get(parseInt(id));
                          const newState: Partial<EditorState> = {
                              selectedLayerIds: [id]
                          };
                          if (selectedLayer?.type === 'line') {
                              newState.strokeColor = selectedLayer.strokeColor;
                              newState.strokeDash = selectedLayer.strokeDash;
                              newState.strokeWidth = selectedLayer.strokeWidth;
                          }
                          if (selectedLayer?.type === 'shape') {
                              newState.strokeColor = selectedLayer.strokeColor;
                              newState.strokeDash = selectedLayer.strokeDash;
                              newState.strokeWidth = selectedLayer.strokeWidth;
                              newState.shapeFill = selectedLayer.fill;
                          }
                          set(newState);
                      }
                      set({ lastSelectedLayerId: id });
                  },

                  setSlides: (slides) => set({ slides }),
                  setActiveSlideId: (id) => set({ activeSlideId: id }),
                  setSelectedSlides: (ids) => set({ selectedSlides: ids }),
                  setStrokeColor: (strokeColor) => {
                      set((s) => {
                          const newState: Partial<EditorState> = { strokeColor };
                          if (s.selectedLayerIds.length > 0) {
                              const numericId = parseInt(s.selectedLayerIds[0]);
                              const layer = s.layers.get(numericId);
                              if (layer && (layer.type === 'line' || layer.type === 'shape')) {
                                  const newLayers = new Map(s.layers);
                                  newLayers.set(numericId, { ...layer, strokeColor });
                                  newState.layers = newLayers;
                              }
                              if (layer) {
                                  sendLayerUpdate(layer, 'setStrokeColor');
                              }
                          }
                          return newState;
                      });
                      get().markDirty();
                  },
                  setStrokeWidth: (strokeWidth) => {
                      set((s) => {
                          const newState: Partial<EditorState> = { strokeWidth };
                          if (s.selectedLayerIds.length > 0) {
                              const numericId = parseInt(s.selectedLayerIds[0]);
                              const layer = s.layers.get(numericId);
                              if (layer) {
                                  if (layer.type === 'line' || layer.type === 'shape') {
                                      const updatedLayer = { ...layer, strokeWidth };
                                      const newLayers = new Map(s.layers);
                                      newLayers.set(numericId, updatedLayer);
                                      newState.layers = newLayers;
                                      sendLayerUpdate(updatedLayer, 'setStrokeWidth');
                                  }
                              }
                          }
                          return newState;
                      });
                      get().markDirty();
                  },
                  setStrokeDash: (strokeDash) => {
                      set((s) => {
                          const newState: Partial<EditorState> = { strokeDash };
                          if (s.selectedLayerIds.length > 0) {
                              const numericId = parseInt(s.selectedLayerIds[0]);
                              const layer = s.layers.get(numericId);
                              if (layer) {
                                  if (layer.type === 'line' || layer.type === 'shape') {
                                      const updatedLayer = { ...layer, strokeDash };
                                      const newLayers = new Map(s.layers);
                                      newLayers.set(numericId, updatedLayer);
                                      newState.layers = newLayers;
                                      sendLayerUpdate(updatedLayer, 'setStrokeDash');
                                  }
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
                              const layer = s.layers.get(numericId);
                              if (layer) {
                                  const updatedLayer = { ...layer, fill };
                                  const newLayers = new Map(s.layers);
                                  newLayers.set(numericId, updatedLayer);
                                  newState.layers = newLayers;
                                  sendLayerUpdate(updatedLayer, 'setShapeFill');
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

                  allocateId: () => _nextId++,

                  allocateZIndex: () => _nextZIndex++,

                  // ── Side-effect actions ───────────────────────────────────────────────

                  deleteSelectedLayer: () => {
                      const { selectedLayerIds } = get();
                      if (!selectedLayerIds.length) return;
                      const numericId = parseInt(selectedLayerIds[0]);
                      const engine = EditorEngine.getInstance();
                      engine.sendJSON({ type: 'delete_layer', numericId });
                      set((s) => {
                          const newLayers = new Map(s.layers);
                          newLayers.delete(numericId);
                          return { layers: newLayers, selectedLayerIds: [] };
                      });
                      get().markDirty();
                  },

                  bringToFront: () => {
                      const s = get();
                      if (!s.selectedLayerIds.length) return;
                      const numericId = parseInt(s.selectedLayerIds[0]);
                      const layer = s.layers.get(numericId);
                      if (!layer) return;

                      const alreadyOnTop = layer.config.zIndex === _nextZIndex;
                      const newZIndex = alreadyOnTop ? layer.config.zIndex : _nextZIndex;
                      if (!alreadyOnTop) _nextZIndex += 1;
                      const updatedConfig = { ...layer.config, zIndex: newZIndex };
                      const updatedLayer = { ...layer, config: updatedConfig };

                      const newLayers = new Map(s.layers);
                      newLayers.set(numericId, updatedLayer);
                      set({ layers: newLayers });

                      sendLayerUpdate(updatedLayer, 'bringToFront');
                      get().markDirty();
                  },

                  sendToBack: () => {
                      const s = get();
                      if (!s.selectedLayerIds.length) return;
                      const numericId = parseInt(s.selectedLayerIds[0]);
                      const layer = s.layers.get(numericId);
                      if (!layer) return;

                      const minZIndex = Array.from(s.layers.values()).reduce(
                          (min, l) => Math.min(min, l.config.zIndex),
                          Infinity
                      );
                      const newZIndex =
                          layer.config.zIndex === minZIndex ? minZIndex : minZIndex - 1;
                      const updatedConfig = { ...layer.config, zIndex: newZIndex };
                      const updatedLayer = { ...layer, config: updatedConfig };

                      const newLayers = new Map(s.layers);
                      newLayers.set(numericId, updatedLayer);
                      set({ layers: newLayers });

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
                              zIndex,
                              visible: true
                          },
                          textHtml: '<p>New Text</p>'
                      };

                      set((s) => {
                          const newLayers = new Map(s.layers);
                          newLayers.set(numericId, newLayer);
                          return { layers: newLayers, selectedLayerIds: [numericId.toString()] };
                      });
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
                              zIndex,
                              visible: true
                          },
                          view: {
                              latitude: 37.7751,
                              longitude: -122.4193,
                              zoom: 11,
                              bearing: 0,
                              pitch: 0
                          }
                      };

                      set((s) => {
                          const newLayers = new Map(s.layers);
                          newLayers.set(numericId, newLayer);
                          return { layers: newLayers, selectedLayerIds: [numericId.toString()] };
                      });
                      const engine = EditorEngine.getInstance();
                      engine.sendJSON({
                          type: 'upsert_layer',
                          origin: 'addMapLayer',
                          layer: newLayer
                      });
                      get().markDirty();
                  },

                  addWebLayer: () => {
                      const { allocateId, allocateZIndex } = get();
                      const numericId = allocateId();
                      const zIndex = allocateZIndex();

                      const newLayer: LayerWithEditorState = {
                          numericId,
                          type: 'web',
                          config: {
                              cx: 1920 / 2,
                              cy: 1080 / 2,
                              width: 800,
                              height: 600,
                              rotation: 0,
                              scaleX: 1,
                              scaleY: 1,
                              zIndex,
                              visible: true
                          },
                          url: '',
                          scale: 1
                      };

                      set((s) => {
                          const newLayers = new Map(s.layers);
                          newLayers.set(numericId, newLayer);
                          return { layers: newLayers, selectedLayerIds: [numericId.toString()] };
                      });
                      const engine = EditorEngine.getInstance();
                      engine.sendJSON({
                          type: 'upsert_layer',
                          origin: 'addWebLayer',
                          layer: newLayer
                      });
                      get().markDirty();
                  },

                  addShapeLayer: (shape) => {
                      const { allocateId, allocateZIndex, strokeColor, strokeDash, strokeWidth } =
                          get();
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
                              zIndex,
                              visible: true
                          },
                          fill: 'transparent',
                          strokeColor,
                          strokeDash,
                          strokeWidth
                      };

                      set((s) => {
                          const newLayers = new Map(s.layers);
                          newLayers.set(numericId, newLayer);
                          return { layers: newLayers, selectedLayerIds: [numericId.toString()] };
                      });
                      const engine = EditorEngine.getInstance();
                      engine.sendJSON({
                          type: 'upsert_layer',
                          origin: 'addShapeLayer',
                          layer: newLayer
                      });
                      get().markDirty();
                  },

                  addLineLayer: (line) => {
                      const { allocateId, allocateZIndex, strokeColor, strokeDash, strokeWidth } =
                          get();
                      const numericId = allocateId();
                      const zIndex = allocateZIndex();

                      let minX: number | null = null;
                      let minY: number | null = null;
                      let maxX: number | null = null;
                      let maxY: number | null = null;
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
                      }
                      if (minX === null || minY === null || maxX === null || maxY === null)
                          return null;
                      const width = Math.round(maxX - minX);
                      const height = Math.round(maxY - minY);

                      const newLayer: LayerWithEditorState = {
                          numericId,
                          type: 'line',
                          config: {
                              cx: minX,
                              cy: minY,
                              width,
                              height,
                              rotation: 0,
                              scaleX: 1,
                              scaleY: 1,
                              zIndex,
                              visible: true
                          },
                          line: line.map((p) => Math.round(p)),
                          strokeColor,
                          strokeWidth,
                          strokeDash
                      };
                      set((s) => {
                          const newLayers = new Map(s.layers);
                          newLayers.set(numericId, newLayer);
                          return { layers: newLayers, selectedLayerIds: [numericId.toString()] };
                      });
                      const engine = EditorEngine.getInstance();
                      engine.sendJSON({
                          type: 'upsert_layer',
                          origin: 'addLineLayer',
                          layer: newLayer
                      });
                      get().markDirty();
                  },

                  clearStage: () => {
                      const engine = EditorEngine.getInstance();
                      engine.sendJSON({ type: 'clear_stage' });
                      set({ layers: new Map(), selectedLayerIds: [] });
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

                      set({ layers: new Map(updatedLayers.map((l) => [l.numericId, l])) });

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
                      const newSlides = get().slides.map((s) =>
                          s.id === slideId ? { ...s, name } : s
                      );
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
                  },
                  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
                  toggleDrawing: () =>
                      set((s) => ({
                          isDrawing: !s.isDrawing,
                          selectedLayerIds: !s.isDrawing ? [] : s.selectedLayerIds
                      })),
                  toggleSnapping: () => set((s) => ({ isSnapping: !s.isSnapping })),
                  toggleSpacePreview: () => set((s) => ({ showSpacePreview: !s.showSpacePreview })),
                  startTextEditing: (numericId) => {
                      set({
                          editingTextLayerId: numericId
                      });
                  },
                  stopTextEditing: () =>
                      set({
                          editingTextLayerId: null
                      })
              };
          });

if (typeof window !== 'undefined') window.__EDITOR_STORE__ = useEditorStore;

// The engine pushes WebSocket JSON messages directly into the store.
const engine = EditorEngine.getInstance();
const unsubJson = engine.subscribeToJson((data) => {
    const store = useEditorStore.getState();
    if (data.type === 'hydrate') {
        store.hydrate(data.layers);
    } else if (data.type === 'upsert_layer') {
        store.upsertLayer(data.layer);
    } else if (data.type === 'delete_layer') {
        // Remote delete — only update local state, don't re-broadcast
        useEditorStore.setState((s) => {
            const newLayers = new Map(s.layers);
            newLayers.delete(data.numericId);
            return {
                layers: newLayers,
                selectedLayerIds: s.selectedLayerIds.filter(
                    (id) => id !== data.numericId.toString()
                )
            };
        });
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
        if (data.projectId === store.projectId) {
            import('~/router').then(({ queryClient }) => {
                queryClient.invalidateQueries({
                    queryKey: projectAssetsQueryOptions(data.projectId).queryKey
                });
            });
        }
    } else if (data.type === 'wall_node_count') {
        useEditorStore.setState((s) => {
            const next: Partial<EditorState> = {
                wallNodeCounts: { ...s.wallNodeCounts, [data.wallId]: data.connectedNodes }
            };
            if (s.boundWallId === data.wallId && data.connectedNodes <= 0) {
                next.boundWallId = null;
                engine.boundWallId = null;
            }
            return next;
        });
    } else if (data.type === 'wall_binding_status') {
        const state = useEditorStore.getState();
        const currentlyBound = state.boundWallId;
        const matchesCurrentScope =
            data.bound &&
            data.projectId === state.projectId &&
            data.commitId === state.commitId &&
            data.slideId === state.activeSlideId;

        if (matchesCurrentScope) {
            useEditorStore.setState({ boundWallId: data.wallId });
            engine.boundWallId = data.wallId;
        } else if (currentlyBound === data.wallId) {
            useEditorStore.setState({ boundWallId: null });
            engine.boundWallId = null;
        }
    }
});

// Wire connection status into the store
const unsubStatus = engine.onConnectionStatusChange((status) => {
    useEditorStore.setState({ connectionStatus: status });
});

// Wire save responses from the bus back into the store
const unsubSave = engine.subscribeToSaveResponse((data) => {
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

if (import.meta.hot) {
    import.meta.hot.accept();
    import.meta.hot.dispose((data) => {
        unsubJson();
        unsubStatus();
        unsubSave();
        data.editorState = useEditorStore.getState();
        data._nextId = _nextId;
        data._nextZIndex = _nextZIndex;
    });
    if (import.meta.hot.data.editorState) {
        try {
            useEditorStore.setState(import.meta.hot.data.editorState);
            _nextId = import.meta.hot.data._nextId ?? _nextId;
            _nextZIndex = import.meta.hot.data._nextZIndex ?? _nextZIndex;
        } catch (e) {
            console.error('[HMR]: Failed to rehydrate the store:', e);
        }
    }
}
