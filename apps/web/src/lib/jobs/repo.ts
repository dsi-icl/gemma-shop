import { ObjectId } from 'mongodb';
import type { OptionalId } from 'mongodb';

import { collections } from '~/server/collections';

import type { JobDocument, JobPayload, JobResult, JobType } from './types';

const LEASE_MS = 30_000;
const RETRY_BACKOFF_MS = 5_000;

let indexesReady = false;

export async function ensureJobIndexes() {
    if (indexesReady) return;
    await collections.jobs.createIndexes([
        {
            key: { nodeId: 1, status: 1, runAfter: 1, createdAt: 1 },
            name: 'nodeId_status_runAfter_createdAt'
        },
        { key: { leaseUntil: 1 }, name: 'leaseUntil' },
        { key: { updatedAt: 1 }, name: 'updatedAt' }
    ]);
    indexesReady = true;
}

export async function enqueueJob({
    nodeId,
    type,
    payload,
    maxAttempts = 3
}: {
    nodeId: string;
    type: JobType;
    payload: JobPayload;
    maxAttempts?: number;
}) {
    const now = new Date();
    const doc: OptionalId<JobDocument> = {
        nodeId,
        type,
        status: 'queued' as const,
        payload,
        attempts: 0,
        maxAttempts,
        runAfter: now,
        createdAt: now,
        updatedAt: now
    };
    const inserted = await collections.jobs.insertOne(doc as any);
    return inserted.insertedId;
}

export async function getJobById(jobId: ObjectId) {
    return collections.jobs.findOne({ _id: jobId });
}

export async function claimNextJob(workerId: string, nodeId: string) {
    const now = new Date();
    const claimed = await collections.jobs.findOneAndUpdate(
        {
            nodeId,
            status: 'queued',
            runAfter: { $lte: now }
        },
        {
            $set: {
                status: 'running',
                leaseOwner: workerId,
                leaseUntil: new Date(now.getTime() + LEASE_MS),
                startedAt: now,
                lastHeartbeatAt: now,
                updatedAt: now
            },
            $inc: { attempts: 1 }
        },
        {
            sort: { createdAt: 1 },
            returnDocument: 'after'
        }
    );
    return claimed;
}

export async function heartbeatJob(jobId: ObjectId, workerId: string, progress?: number) {
    const now = new Date();
    await collections.jobs.updateOne(
        { _id: jobId, status: 'running', leaseOwner: workerId },
        {
            $set: {
                leaseUntil: new Date(now.getTime() + LEASE_MS),
                lastHeartbeatAt: now,
                ...(typeof progress === 'number' ? { lastProgressAt: now } : {}),
                updatedAt: now
            }
        }
    );
}

export async function completeJob(jobId: ObjectId, workerId: string, result: JobResult) {
    const now = new Date();
    await collections.jobs.updateOne(
        { _id: jobId, status: 'running', leaseOwner: workerId },
        {
            $set: {
                status: 'completed',
                result,
                completedAt: now,
                updatedAt: now
            },
            $unset: { leaseOwner: '', leaseUntil: '' }
        }
    );
}

export async function failJob(jobId: ObjectId, workerId: string, error: string) {
    const now = new Date();
    const current = await collections.jobs.findOne({ _id: jobId });
    if (!current) return;

    const shouldRetry = current.attempts < current.maxAttempts;
    await collections.jobs.updateOne(
        { _id: jobId, status: 'running', leaseOwner: workerId },
        shouldRetry
            ? {
                  $set: {
                      status: 'queued',
                      error,
                      runAfter: new Date(now.getTime() + RETRY_BACKOFF_MS * current.attempts),
                      updatedAt: now
                  },
                  $unset: { leaseOwner: '', leaseUntil: '', startedAt: '' }
              }
            : {
                  $set: {
                      status: 'failed',
                      error,
                      completedAt: now,
                      updatedAt: now
                  },
                  $unset: { leaseOwner: '', leaseUntil: '' }
              }
    );
}

export async function markStalledRunningJobs(staleMs: number) {
    const cutoff = new Date(Date.now() - staleMs);
    const cursor = collections.jobs.find({
        status: 'running',
        $or: [{ lastHeartbeatAt: { $lt: cutoff } }, { leaseUntil: { $lt: new Date() } }]
    });
    for await (const job of cursor) {
        const shouldRetry = job.attempts < job.maxAttempts;
        const now = new Date();
        await collections.jobs.updateOne(
            { _id: job._id, status: 'running' },
            shouldRetry
                ? {
                      $set: {
                          status: 'queued',
                          error: 'Job heartbeat stalled; re-queued',
                          runAfter: new Date(now.getTime() + RETRY_BACKOFF_MS),
                          updatedAt: now
                      },
                      $unset: { leaseOwner: '', leaseUntil: '', startedAt: '' }
                  }
                : {
                      $set: {
                          status: 'stalled',
                          error: 'Job heartbeat stalled',
                          completedAt: now,
                          updatedAt: now
                      },
                      $unset: { leaseOwner: '', leaseUntil: '' }
                  }
        );
    }
}
