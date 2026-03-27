import { z } from 'zod';

const oid = z.string();

export const DeviceKind = z.enum(['wall', 'gallery', 'controller']);
export type DeviceKind = z.infer<typeof DeviceKind>;

export const DeviceStatus = z.enum(['pending', 'active', 'revoked']);
export type DeviceStatus = z.infer<typeof DeviceStatus>;

export const DeviceSchema = z.object({
    _id: oid,
    deviceId: z.string(),
    publicKey: z.string(),
    kind: DeviceKind,
    status: DeviceStatus,
    assignedWallId: z.string().nullable().optional(),
    challenge: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    lastSeenAt: z.iso.datetime().nullable().optional(),
    label: z.string().nullable().optional(),
    notes: z.string().nullable().optional()
});
export type Device = z.infer<typeof DeviceSchema>;
