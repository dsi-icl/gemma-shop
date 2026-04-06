import type { PublicDoc } from '@repo/db/collections';
import type { ProjectDocument } from '@repo/db/documents';
import type { Project } from '@repo/db/schema';

import { epochToISO, toIdString } from '~/server/serialization';

export function serializeProject(doc: PublicDoc<ProjectDocument>): Project {
    return {
        id: doc.id,
        name: doc.name,
        authorOrganisation: doc.authorOrganisation,
        description: doc.description,
        tags: doc.tags,
        visibility: doc.visibility,
        heroImages: doc.heroImages,
        customControlUrl: doc.customControlUrl ?? null,
        customRenderUrl: doc.customRenderUrl ?? null,
        customRenderCompat: doc.customRenderCompat ?? false,
        customRenderProxy: doc.customRenderProxy ?? false,
        collaborators: doc.collaborators,
        headCommitId: doc.headCommitId ? toIdString(doc.headCommitId) : null,
        publishedCommitId: doc.publishedCommitId ? toIdString(doc.publishedCommitId) : null,
        deletedAt: doc.deletedAt != null ? epochToISO(doc.deletedAt) : null,
        deletedBy: doc.deletedBy ?? null,
        createdBy: doc.createdBy,
        createdAt: epochToISO(doc.createdAt),
        updatedAt: epochToISO(doc.updatedAt)
    } satisfies Project;
}
