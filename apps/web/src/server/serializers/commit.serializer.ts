import { serializeForClient, toIdString, toScalarString } from '~/server/serialization';

export interface SerializedCommit {
    _id: string;
    projectId: string;
    parentId: string | null;
    authorId: string | null;
    message: string;
    isMutableHead: boolean;
    isAutoSave: boolean;
    firstSlideId: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface SerializedCommitWithContent extends SerializedCommit {
    content: {
        slides: {
            id: string;
            name?: string;
            order: number;
            layers: any[];
        }[];
    };
}

export function serializeCommit(doc: Record<string, unknown>): SerializedCommitWithContent {
    const content = doc.content as SerializedCommitWithContent['content'];
    return serializeForClient({
        _id: toIdString(doc._id),
        projectId: toIdString(doc.projectId),
        parentId: doc.parentId ? toIdString(doc.parentId) : null,
        authorId: doc.authorId ? toIdString(doc.authorId) : null,
        message: toScalarString(doc.message),
        isMutableHead: Boolean(doc.isMutableHead),
        isAutoSave: Boolean(doc.isAutoSave),
        firstSlideId: content?.slides?.[0]?.id ?? null,
        createdAt:
            doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
        updatedAt:
            doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : String(doc.updatedAt),
        content
    });
}
