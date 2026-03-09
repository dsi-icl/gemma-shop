import type { AuthQueryResult } from '@repo/auth/tanstack/queries';
import type { QueryClient } from '@tanstack/react-query';

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

export type RootRouteContext = {
    origin: string;
    iframed: boolean;
    user: AuthQueryResult | null;
    queryClient: QueryClient;
};
