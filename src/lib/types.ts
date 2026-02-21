export interface LayerPlaybackState {
    status: 'playing' | 'paused';
    anchorMediaTime: number;
    anchorServerTime: number;
}

export interface VirtualLayerState {
    config: {
        cx: number;
        cy: number;
        w: number;
        h: number;
        rotation: number;
        scale: number;
        zIndex: number;
    };
    layerType?: 'video';
    startPos: { cx: number; cy: number; w: number; h: number; rotation: number; scale: number };
    targetPos: { cx: number; cy: number; w: number; h: number; rotation: number; scale: number };
    animStartTime: number;
    animDuration: number;
    playback: LayerPlaybackState;
    rvfcActive?: boolean;
    numericId: number;
    url?: string;
}

export interface LayerState extends VirtualLayerState {
    el: HTMLElement | HTMLVideoElement | null;
}
