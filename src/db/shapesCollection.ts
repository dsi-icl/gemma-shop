import { createCollection, localOnlyCollectionOptions } from '@tanstack/react-db';
import { z } from 'zod';

export const ShapeSchema = z.object({
    id: z.string().max(100),
    type: z.string(),
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

export const shapesCollection = createCollection(
    localOnlyCollectionOptions({
        getKey: (message) => message.id,
        schema: ShapeSchema
        // onUpdate: asyncThrottle(
        //     async () => {
        //         // Update the server with the latest shapes data
        //     },
        //     {
        //         wait: 1000
        //     }
        // )
    })
);
