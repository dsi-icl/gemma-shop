import type { ControllerEngine } from '~/lib/controllerEngine';
import type { EditorEngine } from '~/lib/editorEngine';
import type { EditorStateCreator } from '~/lib/editorStore';
import type { GSMessage, ScopeKey, ScopeState } from '~/lib/types';
import type { WallEngine } from '~/lib/wallEngine';

export {};

declare global {
    interface Window {
        __CONTROLLER_ENGINE__?: ControllerEngine;
        __EDITOR_ENGINE__?: EditorEngine;
        __WALL_ENGINE__?: WallEngine;
        __CONTROLLER_RELOADING__?: boolean;
        __EDITOR_RELOADING__?: boolean;
        __WALL_RELOADING__?: boolean;
        __EDITOR_STORE__?: EditorStateCreator;
    }

    namespace NodeJS {
        interface Process {
            __SCOPED_STAGE_STATE__?: Map<ScopeKey, ScopeState>;
            __BROADCAST_EDITORS__?: (data: GSMessage) => void;
            __BROADCAST_ASSET_ADDED__?: (projectId: string, asset: Record<string, unknown>) => void;
            __VSYNC_INTERVAL__?: ReturnType<typeof setInterval>;
            __AUTO_SAVE_INTERVAL__?: ReturnType<typeof setInterval>;
        }
    }
}
