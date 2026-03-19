import { MonitorIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { adminWallsQueryOptions } from '~/server/admin.queries';

export const Route = createFileRoute('/admin/walls')({
    component: AdminWalls
});

function AdminWalls() {
    const { data: walls = [], isLoading } = useQuery(adminWallsQueryOptions());

    return (
        <div>
            <h1 className="mb-4 text-xl font-semibold">Walls</h1>
            {isLoading ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
            ) : walls.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    No walls registered
                </div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium">Wall ID</th>
                                <th className="px-4 py-3 text-left font-medium">Name</th>
                                <th className="px-4 py-3 text-left font-medium">Connected Nodes</th>
                                <th className="px-4 py-3 text-left font-medium">Bound Project</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {walls.map((wall: any) => (
                                <tr key={wall._id} className="hover:bg-muted/30">
                                    <td className="px-4 py-3 font-mono text-xs">{wall.wallId}</td>
                                    <td className="px-4 py-3">{wall.name ?? '—'}</td>
                                    <td className="px-4 py-3">
                                        <span className="flex items-center gap-1.5">
                                            <MonitorIcon
                                                size={14}
                                                weight={
                                                    wall.connectedNodes > 0 ? 'fill' : 'regular'
                                                }
                                                className={
                                                    wall.connectedNodes > 0
                                                        ? 'text-green-500'
                                                        : 'text-muted-foreground'
                                                }
                                            />
                                            {wall.connectedNodes}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                        {wall.boundProjectId ?? '—'}
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
