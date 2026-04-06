import { z } from 'zod';

export const DeviceKind = z.enum(['wall', 'gallery', 'controller']);
export type DeviceKind = z.infer<typeof DeviceKind>;

export const DeviceStatus = z.enum(['pending', 'active', 'revoked']);
export type DeviceStatus = z.infer<typeof DeviceStatus>;
