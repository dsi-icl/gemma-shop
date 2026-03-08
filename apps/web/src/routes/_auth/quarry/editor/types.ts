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
