'use client';

import {
    closestCenter,
    DndContext,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type UniqueIdentifier
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
    arrayMove,
    SortableContext,
    useSortable,
    verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    EyeClosedIcon,
    EyeIcon,
    CheckCircleIcon as IconCircleCheckFilled,
    DotsThreeVerticalIcon as IconDotsVertical,
    DotsSixVerticalIcon as IconGripVertical
} from '@phosphor-icons/react';
import { useLiveQuery } from '@tanstack/react-db';
import {
    flexRender,
    getCoreRowModel,
    getFacetedRowModel,
    getFacetedUniqueValues,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type ColumnFiltersState,
    type Row,
    type SortingState,
    type VisibilityState
} from '@tanstack/react-table';
import * as React from 'react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { ShapeSchema, shapesCollection } from '@/db/shapesCollection';
import { cn } from '@/lib/utils';

import { ColorPicker } from './ColourPicker';
import { Toggle } from './ui/toggle';

// Create a separate component for the drag handle
function DragHandle({ order }: { order: number }) {
    const { attributes, listeners } = useSortable({
        id: order
    });

    return (
        <Button
            {...attributes}
            {...listeners}
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-6 hover:bg-transparent"
        >
            <IconGripVertical className="text-muted-foreground size-3" />
            <span className="sr-only">Drag to reorder</span>
        </Button>
    );
}

const columns: ColumnDef<z.infer<typeof ShapeSchema>>[] = [
    {
        id: 'drag',
        size: 10,
        header: () => null,
        cell: ({ row }) => <DragHandle order={row.original.order} />
    },
    {
        id: 'preview',
        size: 30,
        header: () => null,
        cell: ({ row }) => (
            <ColorPicker
                value={row.original.fill}
                onChange={(color) => {
                    shapesCollection.update(row.original.id, (attrs) => {
                        attrs.fill = color;
                    });
                }}
            />
            // <div className="h-6 w-8 border" style={{ backgroundColor: row.original.fill }} />
        )
    },
    {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => {
            return (
                <div className="flex flex-col">
                    <span className="flex w-full items-center gap-2">
                        {row.original.order} &gt; {row.original.id} {row.original.type}
                    </span>
                    <span className="flex w-full items-center gap-2 text-xs">
                        x:{row.original.x} y:{row.original.y} r:{row.original.rotation}°
                    </span>
                </div>
            );
        },
        enableHiding: false
    },
    {
        id: 'actions',
        size: 50,
        cell: ({ row }) => (
            <Toggle
                aria-label="Toggle visibility"
                size="sm"
                variant="outline"
                onPressedChange={() =>
                    shapesCollection.update(row.original.id, (shape) => {
                        shape.visible = !shape.visible;
                    })
                }
            >
                {row.original.visible ? (
                    <EyeIcon className="h-4 w-4" />
                ) : (
                    <EyeClosedIcon className="h-4 w-4" />
                )}
            </Toggle>
        )
    }
];

function DraggableRow({ row }: { row: Row<z.infer<typeof ShapeSchema>> }) {
    const { transform, transition, setNodeRef, isDragging } = useSortable({
        id: row.original.order
    });

    const selectShape = () => {
        const alreadySelectedShapeId = Array.from(shapesCollection.values())?.find(
            (s) => s.selected
        )?.id;
        if (alreadySelectedShapeId === row.original.id) return;
        shapesCollection.update(
            [alreadySelectedShapeId, row.original.id].filter(Boolean),
            (attrs) => {
                attrs.forEach((attr) => {
                    if (attr.id === alreadySelectedShapeId) attr.selected = false;
                    else if (attr.id === row.original.id) attr.selected = true;
                });
            }
        );
    };

    return (
        <TableRow
            data-state={row.getIsSelected() && 'selected'}
            data-dragging={isDragging}
            ref={setNodeRef}
            className={cn(
                row.original.selected && 'bg-blue-950 hover:bg-blue-900',
                'relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80'
            )}
            style={{
                transform: CSS.Transform.toString(transform),
                transition: transition
            }}
            onClick={selectShape}
        >
            {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
            ))}
        </TableRow>
    );
}

export function LayersTable() {
    const { data, isLoading: areShapesLoading } = useLiveQuery((q) =>
        q.from({ shapes: shapesCollection })
    );
    const layers = React.useMemo(
        () => data?.slice().sort((a, b) => a.order - b.order) || [],
        [data]
    );
    const [rowSelection, setRowSelection] = React.useState({});
    const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
    const [sorting, setSorting] = React.useState<SortingState>([]);
    const [pagination, setPagination] = React.useState({
        pageIndex: 0,
        pageSize: 100
    });
    const sortableId = React.useId();
    const sensors = useSensors(
        useSensor(MouseSensor, {}),
        useSensor(TouchSensor, {}),
        useSensor(KeyboardSensor, {})
    );

    // const dataIds = React.useMemo<UniqueIdentifier[]>(
    //     () => data?.map(({ order }) => order) || [],
    //     [data]
    // );

    const table = useReactTable({
        data: layers,
        columns,
        state: {
            sorting,
            columnVisibility,
            rowSelection,
            columnFilters,
            pagination
        },
        getRowId: (row) => row.id.toString(),
        enableRowSelection: true,
        onRowSelectionChange: setRowSelection,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        onPaginationChange: setPagination,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFacetedRowModel: getFacetedRowModel(),
        getFacetedUniqueValues: getFacetedUniqueValues()
    });

    console.log('>> >', JSON.stringify(layers.map((d) => d.order)));
    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (active && over && active.id !== over.id) {
            // shapesCollection.update([active.id, over.id], (attrs) => {
            //     attrs.forEach((attr) => {
            //         if (attr.id === active.id) attr.order = dataIds.indexOf(over.id);
            //         else if (attr.id === over.id) attr.order = dataIds.indexOf(active.id);
            //     });
            // })
            // setData((data) => {
            // const oldIndex = dataIds.indexOf(active.id);
            // const newIndex = dataIds.indexOf(over.id);
            console.log('DE >', JSON.stringify(layers.map((d) => d.order)));
            const oldIndex = layers.findIndex((d) => d.order === active.id);
            const newIndex = layers.findIndex((d) => d.order === over.id);
            const sortedData = arrayMove(layers, oldIndex, newIndex);
            // console.log(active.id, over.id, oldIndex, newIndex, sortedData, dataIds);
            shapesCollection.update(
                sortedData.map((d) => d.id),
                (attrs) => {
                    attrs.forEach((attr, index) => {
                        console.log('Updating order of', attr.order, 'to', index);
                        attrs[index].order = index;
                    });
                }
            );
            // });
        }
    }

    return (
        <div className="h-full w-full overflow-hidden">
            <DndContext
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis]}
                onDragEnd={handleDragEnd}
                sensors={sensors}
                id={sortableId}
            >
                <Table>
                    {/* <TableHeader className="bg-muted sticky top-0 z-10">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <TableHead key={header.id} colSpan={header.colSpan}>
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                      header.column.columnDef.header,
                                                      header.getContext()
                                                  )}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableHeader> */}
                    <TableBody className="**:data-[slot=table-cell]:first:w-8">
                        {table.getRowModel().rows?.length ? (
                            <SortableContext
                                items={data.map((d) => d.order)}
                                strategy={verticalListSortingStrategy}
                            >
                                {table.getRowModel().rows.map((row) => (
                                    <DraggableRow
                                        key={`${`${row.original.order}`.padStart(4, '0')}-${row.original.id}`}
                                        row={row}
                                    />
                                ))}
                            </SortableContext>
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center">
                                    No results.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </DndContext>
        </div>
    );
}
