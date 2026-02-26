import { z } from 'zod';

const LayerPositionStateSchema = z.object({
    cx: z.number(),
    cy: z.number(),
    rotation: z.number(),
    scale: z.number()
});

const LayerConfigStateSchema = z
    .object({
        w: z.number(),
        h: z.number(),
        zIndex: z.number(),
        loop: z.boolean().optional(),
        duration: z.number().optional(),
        markdown: z.string().optional()
    })
    .extend(LayerPositionStateSchema.shape);

const LayerPlaybackStateSchema = z.object({
    status: z.enum(['playing', 'paused']),
    anchorMediaTime: z.number(),
    anchorServerTime: z.number()
});

const LayerBaseSchema = z.object({
    numericId: z.number(),
    url: z.string(),
    config: LayerConfigStateSchema,
    startPos: LayerPositionStateSchema,
    targetPos: LayerPositionStateSchema,
    animStartTime: z.number(),
    animDuration: z.number()
});

const LayerSchema = z.discriminatedUnion('type', [
    z
        .object({
            type: z.literal('video'),
            rvfcActive: z.boolean(),
            playback: LayerPlaybackStateSchema
        })
        .extend(LayerBaseSchema.shape),
    z.object({ type: z.literal('image') }).extend(LayerBaseSchema.shape),
    z.object({ type: z.literal('graph') }).extend(LayerBaseSchema.shape),
    z.object({ type: z.literal('text') }).extend(LayerBaseSchema.shape),
    z.object({ type: z.literal('ink') }).extend(LayerBaseSchema.shape)
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
            type: z.literal('upload_progress'),
            numericId: z.number(),
            progress: z.number()
        })
    )
    .or(z.object({ type: z.literal('clear_stage') }))
    .or(z.object({ type: z.literal('ping') }))
    .or(z.object({ type: z.literal('pong'), t0: z.number(), t1: z.number(), t2: z.number() }))
    .or(z.object({ type: z.literal('reboot') }));

export type GSMessage = z.infer<typeof GSMessageSchema>;

export type LayerWithWallState = Layer & {
    el?: HTMLElement | HTMLVideoElement | null;
    visible?: boolean;
};

export type LayerWithEditorState = Layer & { progress?: number; isUploading?: boolean };

export interface StageState {
    layers: Map<number, Layer>;
}
