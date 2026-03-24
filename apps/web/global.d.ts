import type { ControllerEngine } from '~/lib/controllerEngine';
import type { ControllerStateCreator } from '~/lib/controllerStore';
import type { EditorEngine } from '~/lib/editorEngine';
import type { EditorStateCreator } from '~/lib/editorStore';
import type { GalleryEngine } from '~/lib/galleryEngine';
import type { GSMessage, Layer, ScopeKey, ScopeState } from '~/lib/types';
import type { WallEngine } from '~/lib/wallEngine';

export {};

declare global {
    interface Window {
        __CONTROLLER_ENGINE__?: ControllerEngine;
        __EDITOR_ENGINE__?: EditorEngine;
        __WALL_ENGINE__?: WallEngine;
        __GALLERY_ENGINE__?: GalleryEngine;
        __CONTROLLER_RELOADING__?: boolean;
        __EDITOR_RELOADING__?: boolean;
        __WALL_RELOADING__?: boolean;
        __EDITOR_STORE__?: EditorStateCreator;
        __CONTROLLER_STORE__?: ControllerStateCreator;
    }

    namespace NodeJS {
        interface Process {
            __SCOPED_STAGE_STATE__?: Map<ScopeKey, ScopeState>;
            __BROADCAST_EDITORS__?: (data: GSMessage) => void;
            __BROADCAST_ASSET_ADDED__?: (projectId: string, asset: Record<string, unknown>) => void;
            __BROADCAST_WALL_BINDING_CHANGED__?: (wallId: string) => void;
            __BROADCAST_PROJECT_PUBLISH_CHANGED__?: (
                projectId: string,
                publishedCommitId: string | null
            ) => void;
            __YJS_UPSERT_LAYER__?: (payload: {
                projectId: string;
                commitId: string;
                slideId: string;
                layerId: number;
                textHtml: string;
                fallbackLayer?: Extract<Layer, { type: 'text' }>;
            }) => boolean | Promise<boolean>;
            __VSYNC_INTERVAL__?: ReturnType<typeof setInterval>;
            __AUTO_SAVE_INTERVAL__?: ReturnType<typeof setInterval>;
        }
    }
}
