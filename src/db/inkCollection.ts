import { createCollection, localOnlyCollectionOptions } from '@tanstack/react-db';
import { asyncThrottle } from '@tanstack/react-pacer';
import { z } from 'zod';

const InkSchema = z.object({
    id: z.string().max(100),
    tool: z.string(),
    points: z.array(z.number()),
    fill: z.string().optional()
});

export const inkCollection = createCollection(
    localOnlyCollectionOptions({
        getKey: (message) => {
            console.log('Getting key for message:', message);
            return message.id;
        },
        schema: InkSchema
        // onUpdate: asyncThrottle(
        //     async () => {
        //         // Update the server with the latest ink data
        //     },
        //     {
        //         wait: 1000
        //     }
        // )
    })
);
