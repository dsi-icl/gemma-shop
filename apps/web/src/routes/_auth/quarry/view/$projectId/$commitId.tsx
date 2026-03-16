import { ArrowLeftIcon, GitBranchIcon, SlideshowIcon } from '@phosphor-icons/react';
import { Button } from '@repo/ui/components/button';
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup
} from '@repo/ui/components/resizable';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { differenceInDays, format, formatDistanceToNow, isBefore, subMonths } from 'date-fns';
import Konva from 'konva';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer as KonvaLayer, Rect, Circle, Line, Image } from 'react-konva';
import { toast } from 'sonner';

import { ViewerSlatePreview } from '~/components/ViewerSlatePreview';
import { getDOGridLines } from '~/lib/editorHelpers';
import type { LayerWithEditorState } from '~/lib/types';
import { $createBranchHead } from '~/server/projects.fns';
import { commitQueryOptions, projectQueryOptions } from '~/server/projects.queries';

const STAGE_SCALE_FACTOR = 0.15;
const SCREEN_W = 1920;
const SCREEN_H = 1080;
const COLS = 16;
const ROWS = 4;

export const Route = createFileRoute('/_auth/quarry/view/$projectId/$commitId')({
    component: CommitViewer,
    loader: ({ context, params }) => {
        context.queryClient.ensureQueryData(commitQueryOptions(params.commitId));
        context.queryClient.ensureQueryData(projectQueryOptions(params.projectId));
    }
});

/** Read-only image that loads its src and renders on Konva */
function ReadOnlyImage({ layer }: { layer: Extract<LayerWithEditorState, { type: 'image' }> }) {
    const [img, setImg] = useState<HTMLImageElement | null>(null);

    useEffect(() => {
        const i = new window.Image();
        if (!layer.url.startsWith('blob:') && !layer.url.startsWith('data:')) {
            i.crossOrigin = 'anonymous';
        }
        i.onload = () => setImg(i);
        i.src = layer.url;
    }, [layer.url]);

    return (
        <Image
            image={img || undefined}
            x={layer.config.cx}
            y={layer.config.cy}
            width={layer.config.width}
            height={layer.config.height}
            scaleX={layer.config.scaleX}
            scaleY={layer.config.scaleY}
            offsetX={layer.config.width / 2}
            offsetY={layer.config.height / 2}
            rotation={layer.config.rotation}
            listening={false}
        />
    );
}

function CommitViewer() {
    const { projectId, commitId } = Route.useParams();
    const { data: commit } = useSuspenseQuery(commitQueryOptions(commitId));
    const { data: project } = useSuspenseQuery(projectQueryOptions(projectId));
    const navigate = useNavigate();
    const stageSlot = useRef<HTMLDivElement>(null);
    const stageInstance = useRef<Konva.Stage>(null);
    const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
    const [branching, setBranching] = useState(false);

    const slides = useMemo(() => commit.content?.slides ?? [], [commit]);

    // Default to first slide
    useEffect(() => {
        if (!activeSlideId && slides.length > 0) {
            setActiveSlideId(slides[0].id);
        }
    }, [activeSlideId, slides]);

    const activeLayers = useMemo(() => {
        const slide = slides.find((s) => s.id === activeSlideId);
        return (slide?.layers ?? []) as LayerWithEditorState[];
    }, [slides, activeSlideId]);

    const sortedLayers = useMemo(
        () => [...activeLayers].sort((a, b) => a.config.zIndex - b.config.zIndex),
        [activeLayers]
    );

    const handleEditFromVersion = async () => {
        setBranching(true);
        try {
            if (commit.isMutableHead && project.headCommitId === commitId) {
                // This IS the project head — just navigate to the editor
                const firstSlideId = slides[0]?.id;
                if (!firstSlideId) {
                    toast.error('No slides in this commit');
                    return;
                }
                navigate({
                    to: '/quarry/editor/$projectId/$commitId/$slideId',
                    params: { projectId, commitId, slideId: firstSlideId }
                });
                return;
            }

            // Create a branch head from this commit
            const branchHeadId = await $createBranchHead({
                data: { projectId, sourceCommitId: commitId }
            });

            // Get the first slide from the new branch
            const firstSlideId = slides[0]?.id;
            if (!firstSlideId) {
                toast.error('No slides in this commit');
                return;
            }

            toast.success('Branch created from this version');
            navigate({
                to: '/quarry/editor/$projectId/$commitId/$slideId',
                params: { projectId, commitId: branchHeadId, slideId: firstSlideId }
            });
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setBranching(false);
        }
    };

    const formatRelativeDate = (date: Date): string => {
        const now = new Date();
        const oneMonthAgo = subMonths(now, 1);

        if (isBefore(date, oneMonthAgo)) {
            return format(date, 'd MMM yyyy, HH:mm');
        }

        const daysDifference = differenceInDays(now, date);

        if (daysDifference >= 7) {
            const weeksDifference = Math.round(daysDifference / 7);
            if (weeksDifference === 1) {
                return `a week ago`;
            }
            return `${weeksDifference} weeks ago`;
        }

        if (daysDifference > 0) {
            const distance = formatDistanceToNow(date, { addSuffix: true });
            return `${distance} at ${format(date, 'HH:mm')}`;
        }

        // It's today
        return formatDistanceToNow(date, { addSuffix: true });
    };

    return (
        <div className="container flex min-h-svh min-w-full flex-col pt-18 pb-13">
            <ResizablePanelGroup
                orientation="horizontal"
                className="grow overflow-hidden font-sans text-foreground"
            >
                <ResizablePanel>
                    <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
                        <div className="flex items-center gap-3">
                            <Button
                                render={
                                    <Link
                                        to="/quarry/projects/$projectId/commits"
                                        params={{ projectId }}
                                    />
                                }
                                variant="ghost"
                                size="sm"
                                nativeButton={false}
                            >
                                <ArrowLeftIcon /> Back
                            </Button>
                            <div>
                                <h2 className="text-sm font-medium">{commit.message}</h2>
                                <p className="text-xs text-muted-foreground">
                                    Read-only view ·{' '}
                                    {formatRelativeDate(new Date(commit.createdAt))}
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="default"
                            size="sm"
                            onClick={handleEditFromVersion}
                            disabled={branching}
                        >
                            <GitBranchIcon /> Edit from this version
                        </Button>
                    </div>

                    {/* Main content */}
                    <div className="flex flex-1 overflow-hidden">
                        {/* Canvas area */}
                        <div className="flex flex-1 flex-col overflow-hidden">
                            {/* Stage */}

                            <ViewerSlatePreview
                                stageSlot={stageSlot}
                                stageInstance={stageInstance}
                                stageScaleFactor={STAGE_SCALE_FACTOR}
                                layers={sortedLayers}
                            />
                            <div ref={stageSlot} className="flex-1 overflow-auto bg-black">
                                <Stage
                                    ref={stageInstance}
                                    width={COLS * SCREEN_W * STAGE_SCALE_FACTOR}
                                    height={ROWS * SCREEN_H * STAGE_SCALE_FACTOR}
                                    scaleX={STAGE_SCALE_FACTOR}
                                    scaleY={STAGE_SCALE_FACTOR}
                                >
                                    <KonvaLayer>
                                        {sortedLayers.map((layer) => {
                                            if (layer.type === 'image') {
                                                return (
                                                    <ReadOnlyImage
                                                        key={`img_${layer.numericId}`}
                                                        layer={layer}
                                                    />
                                                );
                                            }
                                            if (layer.type === 'video') {
                                                // Video layers shown as placeholder rect in read-only view
                                                // TODO Should be a blurhash when present
                                                return (
                                                    <Rect
                                                        key={`vid_${layer.numericId}`}
                                                        x={layer.config.cx}
                                                        y={layer.config.cy}
                                                        width={layer.config.width}
                                                        height={layer.config.height}
                                                        scaleX={layer.config.scaleX}
                                                        scaleY={layer.config.scaleY}
                                                        offsetX={layer.config.width / 2}
                                                        offsetY={layer.config.height / 2}
                                                        rotation={layer.config.rotation}
                                                        fill="#333"
                                                        listening={false}
                                                    />
                                                );
                                            }
                                            if (layer.type === 'shape') {
                                                const common = {
                                                    x: layer.config.cx,
                                                    y: layer.config.cy,
                                                    rotation: layer.config.rotation,
                                                    scaleX: layer.config.scaleX,
                                                    scaleY: layer.config.scaleY,
                                                    fill: layer.fill,
                                                    stroke: layer.strokeColor,
                                                    strokeWidth: layer.strokeWidth,
                                                    listening: false as const
                                                };
                                                if (layer.shape === 'rectangle') {
                                                    return (
                                                        <Rect
                                                            key={`shape_${layer.numericId}`}
                                                            {...common}
                                                            width={layer.config.width}
                                                            height={layer.config.height}
                                                            offsetX={layer.config.width / 2}
                                                            offsetY={layer.config.height / 2}
                                                            dash={layer.strokeDash}
                                                        />
                                                    );
                                                }
                                                if (layer.shape === 'circle') {
                                                    return (
                                                        <Circle
                                                            key={`shape_${layer.numericId}`}
                                                            {...common}
                                                            offsetX={layer.config.width / 2}
                                                            offsetY={layer.config.height / 2}
                                                            radius={layer.config.width / 2}
                                                            dash={layer.strokeDash}
                                                        />
                                                    );
                                                }
                                            }
                                            if (layer.type === 'ink') {
                                                return (
                                                    <Line
                                                        key={`ink_${layer.numericId}`}
                                                        points={layer.line}
                                                        stroke={layer.color}
                                                        strokeWidth={layer.width}
                                                        dash={layer.dash}
                                                        dashEnabled={true}
                                                        tension={0.4}
                                                        lineCap="round"
                                                        lineJoin="round"
                                                        listening={false}
                                                    />
                                                );
                                            }
                                            // Fallback placeholder
                                            return (
                                                <Rect
                                                    key={`fallback_${layer.numericId}`}
                                                    x={layer.config.cx}
                                                    y={layer.config.cy}
                                                    width={layer.config.width}
                                                    height={layer.config.height}
                                                    offsetX={layer.config.width / 2}
                                                    offsetY={layer.config.height / 2}
                                                    rotation={layer.config.rotation}
                                                    fill="#555"
                                                    listening={false}
                                                />
                                            );
                                        })}
                                        {getDOGridLines(COLS * SCREEN_W, ROWS * SCREEN_H, 20)}
                                    </KonvaLayer>
                                </Stage>
                            </div>
                        </div>
                    </div>
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel defaultSize={300} minSize={200}>
                    {/* Slide list sidebar */}
                    <div className="flex w-full flex-col border-l border-border">
                        <div className="flex h-13 shrink-0 cursor-pointer items-center justify-between border-b border-border bg-muted/50 px-4">
                            <h2 className="flex items-center gap-2 text-sm font-semibold">
                                <SlideshowIcon size={18} weight="bold" /> Slides
                            </h2>
                        </div>
                        <div className="flex-1 space-y-1 overflow-y-auto p-2">
                            {slides
                                .sort((a, b) => a.order - b.order)
                                .map((slide, idx) => (
                                    <button
                                        key={slide.id}
                                        onClick={() => setActiveSlideId(slide.id)}
                                        className={`w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-card/50 ${
                                            activeSlideId === slide.id
                                                ? 'bg-primary/10 text-primary'
                                                : 'text-muted-foreground hover:bg-accent'
                                        }`}
                                    >
                                        <span className="font-medium">Slide {idx + 1}</span>
                                    </button>
                                ))}
                        </div>
                    </div>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}
