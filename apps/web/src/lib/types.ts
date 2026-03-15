import { z } from 'zod';

// ── Layer schemas ────────────────────────────────────────────────────────────

const LayerPositionStateSchema = z.object({
    cx: z.number(),
    cy: z.number(),
    width: z.number(),
    height: z.number(),
    rotation: z.number(),
    scaleX: z.number(),
    scaleY: z.number()
});

export type LayerPositionState = z.infer<typeof LayerPositionStateSchema>;

const LayerConfigStateSchema = z
    .object({ zIndex: z.number() })
    .extend(LayerPositionStateSchema.shape);

const LayerPlaybackStateSchema = z.object({
    status: z.enum(['playing', 'paused']),
    anchorMediaTime: z.number(),
    anchorServerTime: z.number()
});

const LayerBaseSchema = z.object({ numericId: z.number(), config: LayerConfigStateSchema });

const LayerSchema = z.discriminatedUnion('type', [
    z
        .object({
            type: z.literal('video'),
            url: z.string(),
            loop: z.boolean(),
            duration: z.number(),
            rvfcActive: z.boolean(),
            blurhash: z.string().optional(),
            playback: LayerPlaybackStateSchema
        })
        .extend(LayerBaseSchema.shape),
    z
        .object({
            type: z.literal('image'),
            url: z.string(),
            blurhash: z.string().optional()
        })
        .extend(LayerBaseSchema.shape),
    z.object({ type: z.literal('graph') }).extend(LayerBaseSchema.shape),
    z.object({ type: z.literal('text'), textProto: z.string() }).extend(LayerBaseSchema.shape),
    z
        .object({
            type: z.literal('map'),
            view: z.object({
                latitude: z.number(),
                longitude: z.number(),
                zoom: z.number(),
                bearing: z.number(),
                pitch: z.number()
            })
        })
        .extend(LayerBaseSchema.shape),
    z
        .object({
            type: z.literal('ink'),
            line: z.array(z.number()),
            color: z.string(),
            width: z.number(),
            dash: z.array(z.number())
        })
        .extend(LayerBaseSchema.shape),
    z
        .object({
            type: z.literal('shape'),
            shape: z.enum(['rectangle', 'circle']),
            fill: z.string(),
            strokeColor: z.string(),
            strokeDash: z.array(z.number()),
            strokeWidth: z.number()
        })
        .extend(LayerBaseSchema.shape)
]);

export type Layer = z.infer<typeof LayerSchema>;

// ── Hello schema (exported separately for handshake-only validation) ─────────

const HelloMessageBaseSchema = z.object({ type: z.literal('hello') });

export const HelloSchema = z.discriminatedUnion('specimen', [
    HelloMessageBaseSchema.extend({
        specimen: z.literal('wall'),
        wallId: z.string(),
        col: z.number(),
        row: z.number()
    }),
    HelloMessageBaseSchema.extend({
        specimen: z.literal('controller'),
        wallId: z.string()
    }),
    HelloMessageBaseSchema.extend({
        specimen: z.literal('editor'),
        projectId: z.string(),
        slideId: z.string()
    }),
    HelloMessageBaseSchema.extend({
        specimen: z.literal('roy')
    })
]);

// ── Full message schema (kept for diagnostics fallback & client-side use) ────

export const GSMessageSchema = z.discriminatedUnion('type', [
    z.discriminatedUnion('specimen', [
        HelloMessageBaseSchema.extend({
            type: z.literal('hello'),
            specimen: z.literal('wall'),
            wallId: z.string(),
            col: z.number(),
            row: z.number()
        }),
        HelloMessageBaseSchema.extend({
            type: z.literal('hello'),
            specimen: z.literal('controller'),
            wallId: z.string()
        }),
        HelloMessageBaseSchema.extend({
            type: z.literal('hello'),
            specimen: z.literal('editor'),
            projectId: z.string(),
            slideId: z.string()
        }),
        HelloMessageBaseSchema.extend({
            type: z.literal('hello'),
            specimen: z.literal('roy')
        })
    ]),
    z.object({ type: z.literal('hydrate'), layers: LayerSchema.array() }),
    z.object({ type: z.literal('rehydrate_please') }),
    z.object({
        type: z.literal('upsert_layer'),
        origin: z.string().optional(),
        layer: LayerSchema
    }),
    z.object({ type: z.literal('delete_layer'), numericId: z.number() }),
    z.object({ type: z.literal('video_play'), numericId: z.number() }),
    z.object({ type: z.literal('video_pause'), numericId: z.number() }),
    z.object({
        type: z.literal('video_seek'),
        numericId: z.number(),
        mediaTime: z.number(),
        playback: LayerPlaybackStateSchema
    }),
    z.object({
        type: z.literal('video_sync'),
        numericId: z.number(),
        playback: LayerPlaybackStateSchema
    }),
    z.object({
        type: z.literal('processing_progress'),
        numericId: z.number(),
        progress: z.number()
    }),
    z.object({ type: z.literal('clear_stage') }),
    z.object({ type: z.literal('ping') }),
    z.object({ type: z.literal('pong'), t0: z.number(), t1: z.number(), t2: z.number() }),
    z.object({ type: z.literal('reboot') }),
    z.object({
        type: z.literal('stage_save'),
        message: z.string(),
        isAutoSave: z.boolean().optional()
    }),
    z.object({
        type: z.literal('stage_save_response'),
        success: z.boolean(),
        commitId: z.string().optional(),
        error: z.string().optional()
    }),
    z.object({ type: z.literal('stage_dirty') }),
    z.object({
        type: z.literal('bind_wall'),
        wallId: z.string(),
        projectId: z.string(),
        slideId: z.string()
    }),
    z.object({ type: z.literal('unbind_wall'), wallId: z.string() }),
    z.object({
        type: z.literal('wall_binding_status'),
        wallId: z.string(),
        bound: z.boolean(),
        projectId: z.string().optional(),
        slideId: z.string().optional()
    })
]);

export type GSMessage = z.infer<typeof GSMessageSchema>;

// ── Client-side extended layer types ─────────────────────────────────────────

export type LayerWithWallComponentState = Layer & { el?: HTMLElement; visible?: boolean };

export type LayerWithWallEngineState = LayerWithWallComponentState & {
    startPos: LayerPositionState;
    targetPos: LayerPositionState;
    animStartTime: number;
    animDuration: number;
};

export type LayerWithEditorState = Layer & { progress?: number; isUploading?: boolean };

// ── Scope utilities ──────────────────────────────────────────────────────────

/** Human-readable scope label for logging and client display */
export function makeScopeLabel(projectId: string, slideId: string): string {
    return `e:${projectId}:${slideId}`;
}

export interface ScopeState {
    layers: Map<number, Layer>;
    projectId: string;
    slideId: string;
    dirty: boolean;
    /** Cached JSON payload for hydrate messages. Invalidated on any layer mutation. */
    hydrateCache: string | null;
}

export interface Slide {
    id: string;
    description: string;
}
