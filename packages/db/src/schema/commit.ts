// Client-side can't use the actual type
import { ObjectId } from 'mongodb';
import { z } from 'zod';
const oid = z.union([z.string(), z.instanceof(ObjectId)]).transform((v) => new ObjectId(v));

// const oid = z.string()
export const CommitSchema = z.object({
    _id: oid.optional(),
    projectId: oid,
    parentId: oid.nullable(),
    authorId: oid,
    message: z.string(),
    content: z.object({
        slides: z.array(
            z.object({
                id: z.string(),
                order: z.number(),
                layers: z.array(z.any())
            })
        )
    }),
    isAutoSave: z.boolean().default(false),
    isMutableHead: z.boolean().default(false),
    createdAt: z.date().default(() => new Date())
});
