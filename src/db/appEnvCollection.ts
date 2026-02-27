import { createCollection, localOnlyCollectionOptions } from '@tanstack/react-db';
import { z } from 'zod';

export const EnvSchema = z
    .object({
        key: z.literal('editor:showGrid'),
        value: z.boolean().default(true)
    })
    .or(
        z.object({
            key: z.literal('editor:highlightBg'),
            value: z.boolean().default(true)
        })
    )
    .or(
        z.object({
            key: z.literal('editor:showInk'),
            value: z.boolean().default(true)
        })
    )
    .or(
        z.object({
            key: z.literal('editor:inkTool'),
            value: z.literal('brush').or(z.literal('eraser')).default('brush')
        })
    );

export type EnvType = z.infer<typeof EnvSchema>;

export const appEnvCollection = createCollection(
    localOnlyCollectionOptions({
        getKey: (message) => {
            return message.key;
        },
        schema: EnvSchema
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
