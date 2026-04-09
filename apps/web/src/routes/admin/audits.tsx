import { ClockIcon, FunnelIcon } from '@phosphor-icons/react';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { DateDisplay } from '@repo/ui/components/date-display';
import { Input } from '@repo/ui/components/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@repo/ui/components/select';
import { useQueryClient, useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { adminAuditsInfiniteQueryOptions, type AdminAuditFilters } from '~/server/admin.queries';

export const Route = createFileRoute('/admin/audits')({
    component: AdminAudits,
    head: () => ({
        meta: [{ title: 'Audits · Admin · GemmaShop' }]
    })
});

const OUTCOME_FILTERS = [
    { value: 'all', label: 'All outcomes' },
    { value: 'success', label: 'Success' },
    { value: 'denied', label: 'Denied' },
    { value: 'failure', label: 'Failure' },
    { value: 'error', label: 'Error' }
] as const;
const ALL_AUDIT_OUTCOMES: Array<'success' | 'denied' | 'failure' | 'error'> = [
    'success',
    'denied',
    'failure',
    'error'
];

const RESOURCE_FILTERS = [
    { value: 'all', label: 'All resources' },
    { value: 'project', label: 'Project' },
    { value: 'commit', label: 'Commit' },
    { value: 'asset', label: 'Asset' },
    { value: 'upload_token', label: 'Upload token' },
    { value: 'user', label: 'User' },
    { value: 'device', label: 'Device' },
    { value: 'wall', label: 'Wall' },
    { value: 'bootstrap', label: 'Bootstrap' },
    { value: 'config', label: 'Config' },
    { value: 'smtp', label: 'SMTP' }
] as const;

function outcomeBadgeClass(outcome: string | null | undefined): string {
    if (outcome === 'success')
        return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300';
    if (outcome === 'denied')
        return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300';
    if (outcome === 'failure' || outcome === 'error')
        return 'border-destructive/50 bg-destructive/10 text-destructive dark:bg-destructive/20';
    return '';
}

function labelize(raw: string | null | undefined): string {
    if (!raw) return 'Unknown';
    return raw
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function AdminAudits() {
    const queryClient = useQueryClient();
    const [outcomeFilter, setOutcomeFilter] =
        useState<(typeof OUTCOME_FILTERS)[number]['value']>('all');
    const [resourceFilter, setResourceFilter] =
        useState<(typeof RESOURCE_FILTERS)[number]['value']>('all');
    const [projectIdInput, setProjectIdInput] = useState('');
    const [actorIdInput, setActorIdInput] = useState('');
    const [operationInput, setOperationInput] = useState('');
    const [reasonCodeInput, setReasonCodeInput] = useState('');

    const filters = useMemo<AdminAuditFilters>(
        () => ({
            outcomes: outcomeFilter === 'all' ? ALL_AUDIT_OUTCOMES : [outcomeFilter],
            resourceTypes: resourceFilter === 'all' ? undefined : [resourceFilter],
            projectId: projectIdInput.trim() || undefined,
            actorId: actorIdInput.trim() || undefined,
            operation: operationInput.trim() || undefined,
            reasonCode: reasonCodeInput.trim() || undefined
        }),
        [
            actorIdInput,
            operationInput,
            outcomeFilter,
            projectIdInput,
            reasonCodeInput,
            resourceFilter
        ]
    );

    const queryOptions = useMemo(() => adminAuditsInfiniteQueryOptions(filters), [filters]);
    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isRefetching } =
        useSuspenseInfiniteQuery(queryOptions);

    const items = useMemo(() => data.pages.flatMap((page) => page.items), [data.pages]);
    const sentinelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const node = sentinelRef.current;
        if (!node) return;
        const observer = new IntersectionObserver(
            (entries) => {
                const first = entries[0];
                if (!first?.isIntersecting) return;
                if (!hasNextPage || isFetchingNextPage) return;
                void fetchNextPage();
            },
            { rootMargin: '300px 0px' }
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

    return (
        <div className="space-y-4">
            <div className="sticky top-2 z-10 rounded-xl border bg-background/90 p-3 backdrop-blur">
                <div className="mb-3 flex items-center gap-2 text-xs font-medium text-foreground">
                    <FunnelIcon size={14} />
                    Audit Explorer Filters
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Outcome</span>
                        <Select
                            items={OUTCOME_FILTERS.map((opt) => ({
                                label: opt.label,
                                value: opt.value
                            }))}
                            value={outcomeFilter}
                            onValueChange={(value) =>
                                setOutcomeFilter(value as (typeof OUTCOME_FILTERS)[number]['value'])
                            }
                        >
                            <SelectTrigger size="sm" className="w-full justify-start bg-background">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {OUTCOME_FILTERS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Resource</span>
                        <Select
                            items={RESOURCE_FILTERS.map((opt) => ({
                                label: opt.label,
                                value: opt.value
                            }))}
                            value={resourceFilter}
                            onValueChange={(value) =>
                                setResourceFilter(
                                    value as (typeof RESOURCE_FILTERS)[number]['value']
                                )
                            }
                        >
                            <SelectTrigger size="sm" className="w-full justify-start bg-background">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {RESOURCE_FILTERS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Project ID</span>
                        <Input
                            value={projectIdInput}
                            onChange={(e) => setProjectIdInput(e.currentTarget.value)}
                            placeholder="Project ID"
                            className="h-8 bg-background"
                        />
                    </div>

                    <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Actor ID</span>
                        <Input
                            value={actorIdInput}
                            onChange={(e) => setActorIdInput(e.currentTarget.value)}
                            placeholder="Actor ID"
                            className="h-8 bg-background"
                        />
                    </div>

                    <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Operation</span>
                        <Input
                            value={operationInput}
                            onChange={(e) => setOperationInput(e.currentTarget.value)}
                            placeholder="Operation"
                            className="h-8 bg-background"
                        />
                    </div>

                    <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Reason Code</span>
                        <Input
                            value={reasonCodeInput}
                            onChange={(e) => setReasonCodeInput(e.currentTarget.value)}
                            placeholder="Reason Code"
                            className="h-8 bg-background"
                        />
                    </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            void queryClient.resetQueries({ queryKey: queryOptions.queryKey });
                        }}
                        disabled={isRefetching}
                    >
                        {isRefetching ? 'Refreshing...' : 'Refresh'}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            setOutcomeFilter('all');
                            setResourceFilter('all');
                            setProjectIdInput('');
                            setActorIdInput('');
                            setOperationInput('');
                            setReasonCodeInput('');
                        }}
                    >
                        Reset
                    </Button>
                    <span className="text-xs text-muted-foreground">
                        Loaded {items.length} event{items.length === 1 ? '' : 's'}
                    </span>
                </div>
            </div>

            <div className="rounded-xl border bg-card p-3 text-xs text-muted-foreground">
                <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
                    <FunnelIcon size={14} />
                    Audit Explorer
                </div>
                Loaded {items.length} event{items.length === 1 ? '' : 's'}
            </div>

            <div className="space-y-3">
                {items.map((event) => (
                    <div key={event.id} className="rounded-xl border bg-card p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                                <ClockIcon className="size-4 shrink-0 text-muted-foreground" />
                                <span className="truncate text-sm font-medium">
                                    {labelize(event.action)}
                                </span>
                                <Badge
                                    variant={
                                        event.outcome === 'failure' || event.outcome === 'error'
                                            ? 'destructive'
                                            : 'outline'
                                    }
                                    className={`text-[11px] ${outcomeBadgeClass(event.outcome)}`}
                                >
                                    {labelize(event.outcome)}
                                </Badge>
                                {event.resourceType && (
                                    <Badge variant="outline" className="text-[11px]">
                                        {labelize(event.resourceType)}
                                    </Badge>
                                )}
                            </div>
                            <DateDisplay
                                value={event.createdAt}
                                className="text-xs text-muted-foreground"
                            />
                        </div>

                        <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground md:grid-cols-2">
                            {event.actorId && <span>Actor: {event.actorId}</span>}
                            {event.projectId && <span>Project: {event.projectId}</span>}
                            {event.executionContext?.operation && (
                                <span>Operation: {event.executionContext.operation}</span>
                            )}
                            {event.executionContext?.path && (
                                <span>Path: {event.executionContext.path}</span>
                            )}
                            {event.reasonCode && <span>Reason: {labelize(event.reasonCode)}</span>}
                            {event.executionContext?.surface && (
                                <span>Surface: {event.executionContext.surface}</span>
                            )}
                        </div>

                        {event.changes && (
                            <details className="mt-2">
                                <summary className="cursor-pointer text-xs text-muted-foreground">
                                    View payload
                                </summary>
                                <pre className="mt-2 max-h-44 overflow-auto rounded-lg bg-muted/50 p-2 text-xs">
                                    {JSON.stringify(event.changes, null, 2)}
                                </pre>
                            </details>
                        )}
                    </div>
                ))}
            </div>

            <div ref={sentinelRef} className="h-10" />
            <div className="pb-6 text-center text-xs text-muted-foreground">
                {isFetchingNextPage
                    ? 'Loading more events...'
                    : hasNextPage
                      ? 'Scroll for more'
                      : 'End of audit stream'}
            </div>
        </div>
    );
}
