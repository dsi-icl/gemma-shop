import { z } from 'zod';

export const CollaboratorRole = z.enum(['owner', 'editor', 'viewer']);
export type CollaboratorRole = z.infer<typeof CollaboratorRole>;

export const Collaborator = z.object({
    email: z.email(),
    role: CollaboratorRole
});
export type Collaborator = z.infer<typeof Collaborator>;

export const ProjectVisibility = z.enum(['public', 'private']);
export type ProjectVisibility = z.infer<typeof ProjectVisibility>;
