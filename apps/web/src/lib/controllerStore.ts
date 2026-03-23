import { create } from 'zustand';

export interface ControllerState {
    isDrawing: boolean;
    strokeColor: string;
    strokeWidth: number;
    strokeDash: number[];
    currentLine: number[];
    setDrawing: (isDrawing: boolean) => void;
    toggleDrawing: () => void;
    setStrokeColor: (strokeColor: string) => void;
    setStrokeWidth: (strokeWidth: number) => void;
    setStrokeDash: (strokeDash: number[]) => void;
    startLine: (x: number, y: number) => void;
    appendLinePoint: (x: number, y: number) => void;
    clearCurrentLine: () => void;
    consumeCurrentLine: () => number[];
}

export type ControllerStateCreator = ReturnType<ReturnType<typeof create<ControllerState>>>;

export const useControllerStore =
    typeof window !== 'undefined' && window.__CONTROLLER_STORE__
        ? window.__CONTROLLER_STORE__
        : create<ControllerState>()((set, get) => ({
              isDrawing: false,
              strokeColor: '#ff0000',
              strokeWidth: 10,
              strokeDash: [],
              currentLine: [],
              setDrawing: (isDrawing) =>
                  set((s) => {
                      if (s.isDrawing === isDrawing && (isDrawing || s.currentLine.length === 0)) {
                          return s;
                      }
                      return {
                          isDrawing,
                          currentLine: isDrawing ? s.currentLine : []
                      };
                  }),
              toggleDrawing: () =>
                  set((s) => ({
                      isDrawing: !s.isDrawing,
                      currentLine: s.isDrawing ? [] : s.currentLine
                  })),
              setStrokeColor: (strokeColor) => set({ strokeColor }),
              setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
              setStrokeDash: (strokeDash) => set({ strokeDash }),
              startLine: (x, y) => set({ currentLine: [Math.round(x), Math.round(y)] }),
              appendLinePoint: (x, y) =>
                  set((s) => ({
                      currentLine: s.currentLine.concat([Math.round(x), Math.round(y)])
                  })),
              clearCurrentLine: () =>
                  set((s) => (s.currentLine.length === 0 ? s : { currentLine: [] })),
              consumeCurrentLine: () => {
                  const line = get().currentLine;
                  if (line.length > 0) set({ currentLine: [] });
                  return line;
              }
          }));

if (typeof window !== 'undefined') window.__CONTROLLER_STORE__ = useControllerStore;

if (import.meta.hot) {
    import.meta.hot.accept();
    import.meta.hot.dispose((data) => {
        data.controllerState = useControllerStore.getState();
    });
    if (import.meta.hot.data.controllerState) {
        try {
            useControllerStore.setState(import.meta.hot.data.controllerState);
        } catch (e) {
            console.error('[HMR]: Failed to rehydrate controller store:', e);
        }
    }
}
