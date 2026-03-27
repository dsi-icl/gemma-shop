import { authMiddleware } from '@repo/auth/tanstack/middleware';
import { CommitSchema } from '@repo/db/schema';
import { createServerFn } from '@tanstack/react-start';
import { ObjectId } from 'mongodb';
import { z } from 'zod';

import { collections } from '~/server/collections';
import { serializeForClient } from '~/server/serialization';

import { assertCanEdit, assertCanView, getProject } from './projects';

export const revertToVersion = createServerFn({ method: 'POST' })
    .inputValidator(
        z.object({
            projectId: z.string(),
            targetCommitId: z.string(), // The ID of the version we want to go back to
            reason: z.string().optional().default('Reverted to previous version')
        })
    )
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        const projectId = new ObjectId(data.projectId);
        const targetCommitId = new ObjectId(data.targetCommitId);

        // 1. Verify project access
        const projectDoc = await getProject(data.projectId);
        if (!projectDoc) throw new Error('Project not found');
        assertCanEdit(projectDoc, context.user.email);

        // 2. Fetch the Target Commit (the data we want to restore)
        const targetCommit = await collections.commits.findOne({
            _id: targetCommitId,
            projectId: projectId
        });

        if (!targetCommit) throw new Error('Commit not found');

        // 3. Fetch the Current Project State (raw doc for headCommitId)
        const project = await collections.projects.findOne({ _id: projectId });
        if (!project) throw new Error('Project not found');

        // 4. Create a NEW Commit (This is the "Revert" node)
        const revertCommit = CommitSchema.parse({
            projectId: projectId,
            parentId: project.headCommitId, // Current head becomes the parent
            authorId: new ObjectId(), // Replace with session user ID
            message: `Revert: ${data.reason} (Restored from ${targetCommitId.toString().slice(-6)})`,
            content: targetCommit.content, // Copy content from the old commit
            createdAt: new Date()
        });

        const commitResult = await collections.commits.insertOne(revertCommit);

        // 5. Update the Project Pointer to the new Revert Commit
        await collections.projects.updateOne(
            { _id: projectId },
            {
                $set: { headCommitId: commitResult.insertedId },
                $inc: { version: 1 } // Optional: increment a visible version number
            }
        );

        return { success: true, newHead: commitResult.insertedId.toString() };
    });

export const saveNamedVersion = createServerFn({ method: 'POST' })
    .inputValidator(
        z.object({
            projectId: z.string(),
            message: z.string().min(1, 'Please provide a version name'),
            content: z.any(), // The full slides+layers content
            isAutoSave: z.boolean().optional().default(false)
        })
    )
    .middleware([authMiddleware])
    .handler(async ({ context, data }) => {
        const projectId = new ObjectId(data.projectId);

        const project = await getProject(data.projectId);
        if (!project) throw new Error('Project not found');
        assertCanEdit(project, context.user.email);

        // 1. Create a brand new commit node
        const newCommit = {
            projectId,
            parentId: project.headCommitId, // Point back to the last known state
            authorId: new ObjectId(), // Replace with Better-Auth session user ID
            message: data.message,
            content: data.content,
            isAutoSave: data.isAutoSave,
            createdAt: new Date()
        };

        const result = await collections.commits.insertOne(newCommit);

        // 2. Move the project pointer forward
        await collections.projects.updateOne(
            { _id: projectId },
            {
                $set: {
                    headCommitId: result.insertedId,
                    updatedAt: new Date()
                }
            }
        );

        return { success: true, commitId: result.insertedId.toHexString() };
    });

export const getProjectHistory = createServerFn({ method: 'GET' })
    .inputValidator(z.string()) // projectId
    .middleware([authMiddleware])
    .handler(async ({ context, data: projectId }) => {
        const projectDoc = await getProject(projectId);
        if (!projectDoc) throw new Error('Project not found');
        assertCanView(projectDoc, context.user.email);

        const project = await collections.projects.findOne({ _id: new ObjectId(projectId) });
        if (!project) throw new Error('Project not found');

        // Fetch commits, projecting ONLY metadata (excluding the heavy `content` array)
        const commits = await collections.commits
            .find(
                { projectId: new ObjectId(projectId) },
                { projection: { content: 0 } } // Exclude layers for performance
            )
            .sort({ createdAt: -1 }) // Sort newest to oldest
            .toArray();

        // Filter out auto-saves to prevent visual clutter,
        // BUT keep it if it's the current active head.
        const cleanHistory = commits.filter(
            (commit) => !commit.isAutoSave || commit._id.equals(project.headCommitId)
        );

        return {
            headCommitId: project.headCommitId ? project.headCommitId.toString() : null,
            commits: cleanHistory.map((c) =>
                serializeForClient({
                    id: c._id.toString(),
                    parentId: c.parentId?.toString() || null,
                    message: String(c.message ?? ''),
                    authorId: c.authorId?.toString?.() ?? '',
                    createdAt: c.createdAt,
                    isAutoSave: c.isAutoSave || false
                })
            )
        };
    });
