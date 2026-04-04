import type { ProjectDocument } from '@repo/db/documents';
import type { Project } from '@repo/db/schema';

import { epochToISO, serializeForClient, toIdString } from '~/server/serialization';

export function serializeProject(doc: ProjectDocument): Project {
    return serializeForClient({
        ...doc,
        visibility: doc.visibility === 'public' ? 'public' : 'private',
        _id: toIdString(doc._id),
        headCommitId: doc.headCommitId ? toIdString(doc.headCommitId) : null,
        publishedCommitId: doc.publishedCommitId ? toIdString(doc.publishedCommitId) : null,
        createdAt: epochToISO(doc.createdAt),
        updatedAt: epochToISO(doc.updatedAt),
        deletedAt: doc.deletedAt != null ? epochToISO(doc.deletedAt) : null
    } as Project);
}
