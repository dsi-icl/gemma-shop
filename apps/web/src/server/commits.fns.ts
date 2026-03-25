import { db } from '@repo/db';
import { CommitSchema } from '@repo/db/schema';
import { createServerFn } from '@tanstack/react-start';
import { ObjectId } from 'mongodb';
import { z } from 'zod';

import { withSchemaVersion } from '~/server/schemaVersions';

function serializeForClient<T>(value: T): T {
    if (value instanceof ObjectId) {
        return value.toHexString() as T;
    }
    if (value instanceof Date) {
        return value.toISOString() as T;
    }
    if (Array.isArray(value)) {
        return value.map((item) => serializeForClient(item)) as T;
    }
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = serializeForClient(v);
        }
        return out as T;
    }
    return value;
}

export const revertToVersion = createServerFn({ method: 'POST' })
    .inputValidator(
        z.object({
            projectId: z.string(),
            targetCommitId: z.string(), // The ID of the version we want to go back to
            reason: z.string().optional().default('Reverted to previous version')
        })
    )
    .handler(async ({ data }) => {
        const projectId = new ObjectId(data.projectId);
        const targetCommitId = new ObjectId(data.targetCommitId);

        // 1. Fetch the Target Commit (the data we want to restore)
        const targetCommit = await db.collection('commits').findOne({
            _id: targetCommitId,
            projectId: projectId
        });

        if (!targetCommit) throw new Error('Commit not found');

        // 2. Fetch the Current Project State
        const project = await db.collection('projects').findOne({ _id: projectId });
        if (!project) throw new Error('Project not found');

        // 3. Create a NEW Commit (This is the "Revert" node)
        const revertCommit = CommitSchema.parse({
            projectId: projectId,
            parentId: project.headCommitId, // Current head becomes the parent
            authorId: new ObjectId(), // Replace with session user ID
            message: `Revert: ${data.reason} (Restored from ${targetCommitId.toString().slice(-6)})`,
            content: targetCommit.content, // Copy content from the old commit
            createdAt: new Date()
        });

        const commitResult = await db
            .collection('commits')
            .insertOne(withSchemaVersion('commits', revertCommit as Record<string, unknown>));

        // 4. Update the Project Pointer to the new Revert Commit
        await db.collection('projects').updateOne(
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
    .handler(async ({ data }) => {
        const projectId = new ObjectId(data.projectId);

        const project = await db.collection('projects').findOne({ _id: projectId });
        if (!project) throw new Error('Project not found');

        // 1. Create a brand new commit node
        const newCommit = withSchemaVersion('commits', {
            projectId,
            parentId: project.headCommitId, // Point back to the last known state
            authorId: new ObjectId(), // Replace with Better-Auth session user ID
            message: data.message,
            content: data.content,
            isAutoSave: data.isAutoSave,
            createdAt: new Date()
        });

        const result = await db.collection('commits').insertOne(newCommit);

        // 2. Move the project pointer forward
        await db.collection('projects').updateOne(
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
    .handler(async ({ data: projectId }) => {
        const project = await db.collection('projects').findOne({ _id: new ObjectId(projectId) });
        if (!project) throw new Error('Project not found');

        // Fetch commits, projecting ONLY metadata (excluding the heavy `content` array)
        const commits = await db
            .collection('commits')
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
