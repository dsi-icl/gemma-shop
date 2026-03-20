import '@tanstack/react-start/server-only';
import { db } from '@repo/db';

import { peerCounts, wallsByWallId } from '~/lib/busState';

import { listPublicAssets, deletePublicAsset } from './projects';

export async function adminListUsers() {
    const docs = await db.collection('users').find().sort({ createdAt: -1 }).limit(500).toArray();
    return docs.map((doc) => ({
        ...doc,
        id: doc._id.toHexString(),
        _id: doc._id.toHexString()
    }));
}

export async function adminListProjects() {
    const projects = db.collection('projects');
    const docs = await projects.find().sort({ updatedAt: -1 }).toArray();
    return docs.map((doc) => ({
        ...doc,
        _id: doc._id.toHexString()
    }));
}

export async function adminGetStats() {
    const [userCount, projectCount, commitCount, assetCount] = await Promise.all([
        db.collection('users').countDocuments(),
        db.collection('projects').countDocuments(),
        db.collection('commits').countDocuments(),
        db.collection('assets').countDocuments()
    ]);

    const wallSummary: Record<string, number> = {};
    wallsByWallId.forEach((peers, wallId) => {
        wallSummary[wallId] = peers.size;
    });

    return {
        db: { users: userCount, projects: projectCount, commits: commitCount, assets: assetCount },
        live: { ...peerCounts },
        uptime: process.uptime(),
        walls: wallSummary
    };
}

export async function adminListWalls() {
    const walls = db.collection('walls');
    const docs = await walls.find().sort({ lastSeen: -1 }).toArray();
    return docs.map((doc) => ({
        ...doc,
        _id: doc._id.toHexString(),
        connectedNodes: wallsByWallId.get(doc.wallId)?.size ?? 0
    }));
}

export { listPublicAssets as adminListPublicAssets, deletePublicAsset as adminDeletePublicAsset };
