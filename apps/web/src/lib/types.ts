import { z } from 'zod';

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
            playback: LayerPlaybackStateSchema
        })
        .extend(LayerBaseSchema.shape),
    z.object({ type: z.literal('image'), url: z.string() }).extend(LayerBaseSchema.shape),
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

export const GSMessageSchema = z
    .object({
        type: z.literal('hello'),
        specimen: z.literal('wall').or(z.literal('editor')).or(z.literal('roy'))
    })
    .or(z.object({ type: z.literal('hydrate'), layers: LayerSchema.array() }))
    .or(z.object({ type: z.literal('rehydrate_please') }))
    .or(
        z.object({
            type: z.literal('upsert_layer'),
            origin: z.string().optional(),
            layer: LayerSchema
        })
    )
    .or(z.object({ type: z.literal('delete_layer'), numericId: z.number() }))
    .or(z.object({ type: z.literal('video_play'), numericId: z.number() }))
    .or(z.object({ type: z.literal('video_pause'), numericId: z.number() }))
    .or(
        z.object({
            type: z.literal('video_seek'),
            numericId: z.number(),
            mediaTime: z.number(),
            playback: LayerPlaybackStateSchema
        })
    )
    .or(
        z.object({
            type: z.literal('video_sync'),
            numericId: z.number(),
            playback: LayerPlaybackStateSchema
        })
    )
    .or(
        z.object({
            type: z.literal('processing_progress'),
            numericId: z.number(),
            progress: z.number()
        })
    )
    .or(z.object({ type: z.literal('clear_stage') }))
    .or(z.object({ type: z.literal('ping') }))
    .or(z.object({ type: z.literal('pong'), t0: z.number(), t1: z.number(), t2: z.number() }))
    .or(z.object({ type: z.literal('reboot') }));

export type GSMessage = z.infer<typeof GSMessageSchema>;

export type LayerWithWallComponentState = Layer & { el?: HTMLElement; visible?: boolean };

export type LayerWithWallEngineState = LayerWithWallComponentState & {
    startPos: LayerPositionState;
    targetPos: LayerPositionState;
    animStartTime: number;
    animDuration: number;
};

export type LayerWithEditorState = Layer & { progress?: number; isUploading?: boolean };

export interface StageState {
    layers: Map<number, Layer>;
}

export interface Slide {
    id: string;
    description: string;
}
