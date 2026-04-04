import '@tanstack/react-start/server-only';
import type { Binary, ObjectId } from 'mongodb';

import type { DeviceKind, DeviceStatus } from './schema/device';
import type { CollaboratorRole, ProjectVisibility } from './schema/project';

// ── Better Auth managed ───────────────────────────────────────────────────────
// Minimal interfaces covering only the fields accessed by application code.
// Better Auth owns the write path for these two collections.
// Timestamps remain as Date — Better Auth controls the format.

export interface UserDocument {
    _id: ObjectId;
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    role?: string | null;
    banned?: boolean | null;
    emailVerified?: boolean | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface SessionDocument {
    _id: ObjectId;
    userId: string;
    token: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
    createdAt: Date;
    updatedAt: Date;
}

// ── Application collections ───────────────────────────────────────────────────
// All timestamps are epoch milliseconds (number).
// The collection layer normalises legacy string / Date values on read via fromDB().

export interface ProjectDocument {
    _id: ObjectId;
    name: string;
    authorOrganisation: string;
    description: string;
    tags: string[];
    visibility: ProjectVisibility;
    heroImages: string[];
    customControlUrl?: string | null;
    customRenderUrl?: string | null;
    customRenderCompat: boolean;
    customRenderProxy: boolean;
    collaborators: Array<{ email: string; role: CollaboratorRole }>;
    headCommitId: ObjectId | null;
    publishedCommitId: ObjectId | null;
    deletedAt?: number | null;
    deletedBy?: string | null;
    createdBy: string;
    createdAt: number;
    updatedAt: number;
}

export interface CommitDocument {
    _id: ObjectId;
    projectId: ObjectId;
    parentId: ObjectId | null;
    authorId: ObjectId;
    message: string;
    content: {
        slides: Array<{
            id: string;
            order: number;
            name: string;
            layers: Array<Record<string, unknown>>;
        }>;
    };
    isAutoSave: boolean;
    isMutableHead: boolean;
    createdAt: number;
    updatedAt?: number;
}

export interface AssetDocument {
    _id: ObjectId;
    projectId: ObjectId;
    name: string;
    url: string;
    size: number;
    mimeType?: string | null;
    blurhash?: string | null;
    previewUrl?: string | null;
    sizes?: number[] | null;
    public?: boolean | null;
    /** Set on auto-generated assets (e.g. web screenshots) to exclude from library listings */
    hidden?: boolean;
    deletedAt?: number | null;
    deletedBy?: string | null;
    createdAt: number;
    createdBy: string;
    updatedAt?: number;
}

export interface WallDocument {
    _id: ObjectId;
    wallId: string;
    name: string;
    connectedNodes?: number;
    lastSeen: number;
    boundProjectId?: string | null;
    boundCommitId?: string | null;
    boundSlideId?: string | null;
    boundSource?: 'live' | 'gallery' | null;
    site?: string | null;
    notes?: string | null;
    createdAt: number;
    updatedAt?: number;
}

export interface DeviceDocument {
    _id: ObjectId;
    deviceId: string;
    publicKey: string;
    kind: DeviceKind;
    status: DeviceStatus;
    assignedWallId?: string | null;
    assignedAt?: number;
    assignedBy?: string;
    createdAt: number;
    updatedAt: number;
    lastSeenAt?: number | null;
    label?: string | null;
    notes?: string | null;
}

export interface YDocDocument {
    _id: ObjectId;
    scope: string;
    data: Binary;
    createdAt: number;
    updatedAt: number;
}

export interface AuditLogDocument {
    _id: ObjectId;
    projectId: ObjectId | null;
    actorId: string | null;
    action: string;
    outcome: 'success' | 'denied' | 'failure' | 'error';
    resourceType?: string | null;
    resourceId?: string | null;
    reasonCode?: string | null;
    changes?: Record<string, unknown> | null;
    error?: string | null;
    createdAt: number;
}
