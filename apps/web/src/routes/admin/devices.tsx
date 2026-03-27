import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';

import { adminDevicesQueryOptions, adminWallsQueryOptions } from '~/server/admin.queries';

export const Route = createFileRoute('/admin/devices')({
    component: AdminDevices,
    loader: ({ context }) => {
        context.queryClient.ensureQueryData(adminDevicesQueryOptions());
    }
});

function AdminDevices() {
    const { data: devices = [] } = useSuspenseQuery(adminDevicesQueryOptions());
    const { data: walls = [] } = useQuery(adminWallsQueryOptions());

    return (
        <div className="space-y-6">
            {devices.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    No devices registered
                </div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium">Device ID</th>
                                <th className="px-4 py-3 text-left font-medium">Kind</th>
                                <th className="px-4 py-3 text-left font-medium">Status</th>
                                <th className="px-4 py-3 text-left font-medium">Assigned Wall</th>
                                <th className="px-4 py-3 text-left font-medium">Last Seen</th>
                                <th className="px-4 py-3 text-left font-medium">Updated</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {(devices as Array<any>).map((device) => (
                                <tr key={device.deviceId} className="hover:bg-muted/30">
                                    <td className="px-4 py-3 font-mono text-xs">
                                        {device.deviceId}
                                    </td>
                                    <td className="px-4 py-3 capitalize">{device.kind}</td>
                                    <td className="px-4 py-3 capitalize">{device.status}</td>
                                    <td className="px-4 py-3">
                                        {device.assignedWallId ? (
                                            (() => {
                                                const wall = (walls as Array<any>).find(
                                                    (entry) =>
                                                        entry.wallId === device.assignedWallId
                                                );
                                                const wallId = wall?._id ?? device.assignedWallId;
                                                return (
                                                    <Link
                                                        to="/admin/walls/$wallId"
                                                        params={{ wallId }}
                                                        className="font-mono text-xs underline-offset-2 hover:underline"
                                                    >
                                                        {device.assignedWallId}
                                                    </Link>
                                                );
                                            })()
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground">
                                        {device.lastSeenAt ?? '—'}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground">
                                        {device.updatedAt ?? '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
