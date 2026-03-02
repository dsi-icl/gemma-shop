import type { EditorEngine } from '@/lib/editorEngine';
import type { StageState, GSMessage } from '@/lib/types';
import type { WallEngine } from '@/lib/wallEngine';

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
            __STAGE_STATE__?: StageState;
            __BROADCAST_EDITORS__?: (data: GSMessage) => void;
            __VSYNC_INTERVAL__?: ReturnType<typeof setInterval>;
        }
    }
}
