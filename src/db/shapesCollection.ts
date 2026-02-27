import { createCollection, localOnlyCollectionOptions } from '@tanstack/react-db';
import { asyncThrottle, throttle } from '@tanstack/react-pacer';
import { z } from 'zod';

import { getSocket } from '@/lib/websocketHandler';

export const ShapeSchema = z.object({
    id: z.string().max(100),
    type: z.literal('text').or(z.literal('rect')).or(z.literal('circle')),
    name: z.string(),
    text: z.string().optional(),
    x: z.number(),
    y: z.number(),
    height: z.number(),
    width: z.number(),
    rotation: z.number(),
    visible: z.boolean(),
    selected: z.boolean().default(false),
    fill: z.string(),
    order: z.number()
});

export type ShapeType = z.infer<typeof ShapeSchema>;

export const shapesCollection = createCollection(
    localOnlyCollectionOptions({
        getKey: (message) => message.id,
        schema: ShapeSchema
    })
);

shapesCollection.subscribeChanges(
    throttle(
        () => {
            // TODO BAAD CODE : This filter should not exist !!!!
            if (typeof window !== 'undefined' && window.location.pathname.includes('view')) return;
            const shapes = Array.from(shapesCollection.entries());
            getSocket()?.send(
                JSON.stringify({
                    type: 'shapesCollectionFull',
                    shapes
                })
            );
        },
        {
            wait: 200
        }
    )
);

// const sendToBroadcast = throttle(
//     (shapes: Array<unknown>) => {
//         getSocket()?.send(
//             JSON.stringify({
//                 type: 'shapesCollectionFull',
//                 shapes
//             })
//         );
//     },
//     {
//         wait: 200
//     }
// );
