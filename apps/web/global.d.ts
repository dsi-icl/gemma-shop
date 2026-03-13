import type { EditorEngine } from '~/lib/editorEngine';
import type { GSMessage, ScopeKey, ScopeState } from '~/lib/types';
import type { WallEngine } from '~/lib/wallEngine';

export {};

declare global {
    interface Window {
        __EDITOR_ENGINE__?: EditorEngine;
        __WALL_ENGINE__?: WallEngine;
        __EDITOR_RELOADING__?: boolean;
        __WALL_RELOADING__?: boolean;
    }

    namespace NodeJS {
        interface Process {
            __SCOPED_STAGE_STATE__?: Map<ScopeKey, ScopeState>;
            __BROADCAST_EDITORS__?: (data: GSMessage) => void;
            __VSYNC_INTERVAL__?: ReturnType<typeof setInterval>;
            __AUTO_SAVE_INTERVAL__?: ReturnType<typeof setInterval>;
        }
    }
}
