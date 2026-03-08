import {
    ArchiveIcon,
    ArrowCounterClockwiseIcon,
    CaretUpDownIcon,
    DotsThreeVerticalIcon,
    GlobeIcon,
    GlobeXIcon,
    PlusIcon
} from '@phosphor-icons/react';
import type { Project } from '@repo/db/schema';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@repo/ui/components/dropdown-menu';
import { Input } from '@repo/ui/components/input';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getSortedRowModel,
    useReactTable,
    type SortingState
} from '@tanstack/react-table';
import { useState } from 'react';
import { toast } from 'sonner';

import { $archiveProject, $publishCommit, $restoreProject } from '~/server/projects.fns';
import { projectsQueryOptions } from '~/server/projects.queries';

export const Route = createFileRoute('/_auth/quarry/')({
    component: QuarryIndex,
    loader: ({ context }) => {
        context.queryClient.ensureQueryData(projectsQueryOptions());
    }
});

const columnHelper = createColumnHelper<Project>();

function QuarryIndex() {
    const [showArchived, setShowArchived] = useState(false);
    const [globalFilter, setGlobalFilter] = useState('');
    const [sorting, setSorting] = useState<SortingState>([]);
    const { data: projects } = useSuspenseQuery(projectsQueryOptions(showArchived));
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['projects'] });

    const archiveMutation = useMutation({
        mutationFn: (id: string) => $archiveProject({ data: { id } }),
        onSuccess: () => {
            toast.success('Project archived');
            invalidate();
        },
        onError: (e) => toast.error(e.message)
    });

    const restoreMutation = useMutation({
        mutationFn: (id: string) => $restoreProject({ data: { id } }),
        onSuccess: () => {
            toast.success('Project restored');
            invalidate();
        },
        onError: (e) => toast.error(e.message)
    });

    const unpublishMutation = useMutation({
        mutationFn: (projectId: string) => $publishCommit({ data: { projectId, commitId: null } }),
        onSuccess: () => {
            toast.success('Project unpublished');
            invalidate();
        },
        onError: (e) => toast.error(e.message)
    });

    const columns = [
        columnHelper.accessor('name', {
            header: ({ column }) => (
                <button
                    type="button"
                    className="flex items-center gap-1"
                    onClick={() => column.toggleSorting()}
                >
                    Name <CaretUpDownIcon className="size-3" />
                </button>
            ),
            cell: (info) => (
                <div className="flex items-center gap-2 font-medium">
                    {info.getValue()}
                    {info.row.original.archived && (
                        <Badge variant="secondary" className="text-xs">
                            Archived
                        </Badge>
                    )}
                    {info.row.original.publishedCommitId && (
                        <Badge variant="default" className="text-xs">
                            Public
                        </Badge>
                    )}
                </div>
            )
        }),
        columnHelper.accessor('authorOrganisation', {
            header: ({ column }) => (
                <button
                    type="button"
                    className="flex items-center gap-1"
                    onClick={() => column.toggleSorting()}
                >
                    Author / Org <CaretUpDownIcon className="size-3" />
                </button>
            )
        }),
        columnHelper.accessor('tags', {
            header: 'Tags',
            cell: (info) => (
                <div className="flex flex-wrap gap-1">
                    {info
                        .getValue()
                        .filter((t) => t !== 'public')
                        .slice(0, 3)
                        .map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                            </Badge>
                        ))}
                </div>
            ),
            enableSorting: false
        }),
        columnHelper.accessor('collaborators', {
            header: 'Collaborators',
            cell: (info) => <span className="text-muted-foreground">{info.getValue().length}</span>,
            enableSorting: false
        }),
        columnHelper.accessor('updatedAt', {
            header: ({ column }) => (
                <button
                    type="button"
                    className="flex items-center gap-1"
                    onClick={() => column.toggleSorting()}
                >
                    Updated <CaretUpDownIcon className="size-3" />
                </button>
            ),
            cell: (info) => (
                <span className="text-muted-foreground">
                    {new Date(info.getValue()).toLocaleDateString()}
                </span>
            )
        }),
        columnHelper.display({
            id: 'actions',
            cell: (info) => {
                const project = info.row.original;
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            className="rounded-lg p-1 hover:bg-muted"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <DotsThreeVerticalIcon className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {project.publishedCommitId ? (
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        unpublishMutation.mutate(project._id);
                                    }}
                                >
                                    <GlobeXIcon /> Unpublish
                                </DropdownMenuItem>
                            ) : (
                                <DropdownMenuItem disabled>
                                    <GlobeIcon /> Publish (select a commit first)
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {project.archived ? (
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        restoreMutation.mutate(project._id);
                                    }}
                                >
                                    <ArrowCounterClockwiseIcon />
                                    Restore
                                </DropdownMenuItem>
                            ) : (
                                <DropdownMenuItem
                                    variant="destructive"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        archiveMutation.mutate(project._id);
                                    }}
                                >
                                    <ArchiveIcon />
                                    Archive
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            }
        })
    ];

    // oxlint-disable-next-line
    const table = useReactTable({
        data: projects,
        columns,
        state: { globalFilter, sorting },
        onGlobalFilterChange: setGlobalFilter,
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
        globalFilterFn: (row, _columnId, filterValue: string) => {
            const search = filterValue.toLowerCase();
            const p = row.original;
            return (
                p.name.toLowerCase().includes(search) ||
                p.authorOrganisation.toLowerCase().includes(search) ||
                p.tags.some((t) => t.toLowerCase().includes(search))
            );
        }
    });

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                    <Input
                        placeholder="Search projects..."
                        value={globalFilter}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        className="w-64"
                    />
                    <Button
                        variant={showArchived ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => setShowArchived(!showArchived)}
                    >
                        <ArchiveIcon />
                        {showArchived ? 'Hide archived' : 'Show archived'}
                    </Button>
                </div>
                <Button render={<Link to="/quarry/projects/new" />} nativeButton={false}>
                    <PlusIcon />
                    New project
                </Button>
            </div>

            {table.getRowModel().rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-12 text-muted-foreground">
                    <p>No projects found</p>
                    <Button
                        render={<Link to="/quarry/projects/new" />}
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                    >
                        Create your first project
                    </Button>
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border">
                    <table className="w-full text-sm">
                        <thead>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr key={headerGroup.id} className="border-b bg-muted/50 text-left">
                                    {headerGroup.headers.map((header) => (
                                        <th
                                            key={header.id}
                                            className="px-4 py-3 font-medium text-muted-foreground"
                                        >
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                      header.column.columnDef.header,
                                                      header.getContext()
                                                  )}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {table.getRowModel().rows.map((row) => (
                                <tr
                                    key={row.id}
                                    className="cursor-pointer border-b transition-colors last:border-b-0 hover:bg-muted/30"
                                    onClick={() =>
                                        navigate({
                                            to: '/quarry/projects/$projectId',
                                            params: { projectId: row.original._id }
                                        })
                                    }
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <td key={cell.id} className="px-4 py-3">
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext()
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
