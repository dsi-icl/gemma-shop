import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { adminDevicesForWallQueryOptions } from '~/server/admin.queries';

export const Route = createFileRoute('/admin/walls/$wallId/devices')({
    component: WallDevicesTab
});

function WallDevicesTab() {
    const { wallId } = Route.useParams();
    const { data: devices = [] } = useSuspenseQuery(adminDevicesForWallQueryOptions(wallId));

    return (
        <div className="rounded-lg border border-border">
            {(devices as Array<any>).length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                    No devices assigned to this wall yet.
                </div>
            ) : (
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium">Device ID</th>
                            <th className="px-4 py-3 text-left font-medium">Kind</th>
                            <th className="px-4 py-3 text-left font-medium">Status</th>
                            <th className="px-4 py-3 text-left font-medium">Last Seen</th>
                            <th className="px-4 py-3 text-left font-medium">Updated</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {(devices as Array<any>).map((device) => (
                            <tr key={device.deviceId} className="hover:bg-muted/30">
                                <td className="px-4 py-3 font-mono text-xs">{device.deviceId}</td>
                                <td className="px-4 py-3 capitalize">{device.kind}</td>
                                <td className="px-4 py-3 capitalize">{device.status}</td>
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
            )}
        </div>
    );
}
