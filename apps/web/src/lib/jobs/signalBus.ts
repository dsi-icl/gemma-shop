import { db } from '@repo/db';
import { ObjectId } from 'mongodb';

import { getJobById } from './repo';
import type { JobDocument } from './types';

export interface JobSignalBus {
    waitForTerminal(
        jobId: ObjectId,
        opts?: { requestTimeoutMs?: number; staleHeartbeatMs?: number }
    ): Promise<JobDocument>;
}

class MongoJobSignalBus implements JobSignalBus {
    async waitForTerminal(
        jobId: ObjectId,
        opts?: { requestTimeoutMs?: number; staleHeartbeatMs?: number }
    ): Promise<JobDocument> {
        const requestTimeoutMs = opts?.requestTimeoutMs ?? 5 * 60 * 1000;
        const staleHeartbeatMs = opts?.staleHeartbeatMs ?? 2 * 60 * 1000;

        const first = await getJobById(jobId);
        if (!first) throw new Error(`Job ${jobId.toHexString()} not found`);
        if (isTerminal(first.status)) return first;

        return await new Promise<JobDocument>((resolve, reject) => {
            let settled = false;
            let lastHeartbeatAt = first.lastHeartbeatAt?.getTime() ?? Date.now();
            let statusPollInFlight = false;

            const timeout = setTimeout(() => {
                closeAll();
                reject(
                    new Error(
                        `Job ${jobId.toHexString()} did not complete in ${requestTimeoutMs}ms`
                    )
                );
            }, requestTimeoutMs);

            const heartbeatGuard = setInterval(() => {
                if (Date.now() - lastHeartbeatAt > staleHeartbeatMs) {
                    closeAll();
                    reject(new Error(`Job ${jobId.toHexString()} heartbeat stale`));
                }
            }, 1000);

            // Safety net against change-stream race windows:
            // if a terminal update happens between the initial read and stream attachment,
            // polling guarantees we still observe completion.
            const statusPoll = setInterval(async () => {
                if (settled || statusPollInFlight) return;
                statusPollInFlight = true;
                try {
                    const latest = await getJobById(jobId);
                    if (!latest) return;
                    if (latest.lastHeartbeatAt) {
                        lastHeartbeatAt = new Date(latest.lastHeartbeatAt).getTime();
                    }
                    if (isTerminal(latest.status)) {
                        closeAll();
                        resolve(latest);
                    }
                } catch {
                    // Best-effort fallback poll; stream remains primary signal.
                } finally {
                    statusPollInFlight = false;
                }
            }, 1000);

            const stream = db.collection('jobs').watch(
                [
                    {
                        $match: {
                            'documentKey._id': jobId,
                            operationType: { $in: ['insert', 'update', 'replace'] }
                        }
                    }
                ],
                {
                    fullDocument: 'updateLookup'
                }
            );

            stream.on('change', (change) => {
                if (!('fullDocument' in change)) return;
                const job = change.fullDocument as JobDocument | undefined;
                if (!job) return;
                if (job.lastHeartbeatAt) {
                    lastHeartbeatAt = new Date(job.lastHeartbeatAt).getTime();
                }
                if (isTerminal(job.status)) {
                    closeAll();
                    resolve(job);
                }
            });

            stream.on('error', (err) => {
                closeAll();
                reject(err);
            });

            function closeAll() {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                clearInterval(heartbeatGuard);
                clearInterval(statusPoll);
                void stream.close().catch(() => {});
            }
        });
    }
}

function isTerminal(status: JobDocument['status']) {
    return status === 'completed' || status === 'failed' || status === 'stalled';
}

export const jobSignalBus: JobSignalBus = new MongoJobSignalBus();
