import { createCollection, localOnlyCollectionOptions } from '@tanstack/react-db';
import { throttle } from '@tanstack/react-pacer';
import { z } from 'zod';

import { getSocket } from '@/lib/websocketHandler';

const InkSchema = z.object({
    id: z.string().max(100),
    tool: z.string(),
    points: z.array(z.number()),
    // This `iteration` variable should probably not be there !!!!
    iteration: z.number().optional(),
    fill: z.string().optional()
});

export const inkCollection = createCollection(
    localOnlyCollectionOptions({
        getKey: (message) => message.id,
        schema: InkSchema,
        onInsert: async () => {
            console.log('TUTU INS');
        },
        onUpdate: async () => {
            console.log('TATA *UP');
        },
        onDelete: async () => {
            console.log('TATA DEL');
        }
    })
);

inkCollection.subscribeChanges(
    // throttle(
    () => {
        // TODO BAAD CODE : This filter should not exist !!!!
        if (typeof window !== 'undefined' && window.location.pathname.includes('view')) return;
        console.log('Sending ...');
        const inks = Array.from(inkCollection.entries());
        getSocket()?.send(
            JSON.stringify({
                type: 'inksCollectionFull',
                inks
            })
        );
    }
    //     {
    //         wait: 10
    //     }
    // )
);
