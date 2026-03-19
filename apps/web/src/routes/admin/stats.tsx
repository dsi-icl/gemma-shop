import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { adminStatsQueryOptions } from '~/server/admin.queries';

export const Route = createFileRoute('/admin/stats')({
    component: AdminStats
});

function StatCard({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-2xl font-bold tabular-nums">{value}</div>
            <div className="mt-1 text-sm text-muted-foreground">{label}</div>
        </div>
    );
}

function AdminStats() {
    const { data: stats, isLoading } = useQuery(adminStatsQueryOptions());

    if (isLoading || !stats) return <div className="text-sm text-muted-foreground">Loading...</div>;

    const uptimeMins = Math.floor(stats.uptime / 60);
    const uptimeHours = Math.floor(uptimeMins / 60);
    const uptimeDisplay =
        uptimeHours > 0 ? `${uptimeHours}h ${uptimeMins % 60}m` : `${uptimeMins}m`;

    return (
        <div>
            <h1 className="mb-4 text-xl font-semibold">Stats</h1>

            <h2 className="mb-2 text-sm font-medium tracking-wider text-muted-foreground uppercase">
                Database
            </h2>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Users" value={stats.db.users} />
                <StatCard label="Projects" value={stats.db.projects} />
                <StatCard label="Commits" value={stats.db.commits} />
                <StatCard label="Assets" value={stats.db.assets} />
            </div>

            <h2 className="mb-2 text-sm font-medium tracking-wider text-muted-foreground uppercase">
                Live Connections
            </h2>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Editors" value={stats.live.editor} />
                <StatCard label="Wall Nodes" value={stats.live.wall} />
                <StatCard label="Controllers" value={stats.live.controller} />
                <StatCard label="Roy Peers" value={stats.live.roy} />
            </div>

            <h2 className="mb-2 text-sm font-medium tracking-wider text-muted-foreground uppercase">
                System
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Server Uptime" value={uptimeDisplay} />
            </div>
        </div>
    );
}
