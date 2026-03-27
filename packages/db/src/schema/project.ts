import { z } from 'zod';

// Client-side can't use the actual type
// import { ObjectId } from 'mongodb';
// const oid = z.union([z.string(), z.instanceof(ObjectId)]).transform(v => new ObjectId(v));

const oid = z.string();

export const CollaboratorRole = z.enum(['owner', 'editor', 'viewer']);
export type CollaboratorRole = z.infer<typeof CollaboratorRole>;

export const Collaborator = z.object({
    email: z.email(),
    role: CollaboratorRole
});
export type Collaborator = z.infer<typeof Collaborator>;

export const ProjectVisibility = z.enum(['public', 'private']);
export type ProjectVisibility = z.infer<typeof ProjectVisibility>;

export const ProjectSchema = z.object({
    _id: oid,
    name: z.string().min(1, 'Name is required'),
    authorOrganisation: z.string().min(1, 'Author/Organisation is required'),
    description: z.string().default(''),
    tags: z.array(z.string()).default([]),
    visibility: ProjectVisibility.default('private'),
    heroImages: z.array(z.string()).default([]),
    customControlUrl: z.string().nullish(),
    customRenderUrl: z.string().nullish(),
    customRenderCompat: z.boolean().default(false),
    customRenderProxy: z.boolean().default(false),
    collaborators: z.array(Collaborator).default([]),
    // DAG Pointer (content history, from CommitSchema)
    headCommitId: oid.nullable().default(null),
    // When set, the project is publicly visible using this specific commit
    publishedCommitId: oid.nullable().default(null),
    deletedAt: z.iso.datetime().nullish(),
    deletedBy: z.string().nullish(),
    createdBy: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime()
});
export type Project = z.infer<typeof ProjectSchema>;

export const CreateProjectInput = z.object({
    name: z.string().min(1, 'Name is required'),
    authorOrganisation: z.string().min(1, 'Author/Organisation is required'),
    description: z.string().default(''),
    tags: z.array(z.string()).default([]),
    visibility: ProjectVisibility.default('private'),
    heroImages: z.array(z.string()).default([]),
    customControlUrl: z.string().optional(),
    customRenderUrl: z.string().optional(),
    customRenderCompat: z.boolean().default(false),
    customRenderProxy: z.boolean().default(false),
    collaborators: z.array(Collaborator).default([])
});
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

export const UpdateProjectInput = z.object({
    _id: z.string(),
    name: z.string().min(1, 'Name is required').optional(),
    authorOrganisation: z.string().min(1, 'Author/Organisation is required').optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    visibility: ProjectVisibility.optional(),
    heroImages: z.array(z.string()).optional(),
    customControlUrl: z.string().optional(),
    customRenderUrl: z.string().optional(),
    customRenderCompat: z.boolean().optional(),
    customRenderProxy: z.boolean().optional(),
    collaborators: z.array(Collaborator).optional(),
    publishedCommitId: z.string().nullable().optional()
});
export type UpdateProjectInput = z.infer<typeof UpdateProjectInput>;
