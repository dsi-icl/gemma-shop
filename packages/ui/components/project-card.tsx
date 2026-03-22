import { ArrowRightIcon, EyeIcon, SpinnerGapIcon } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from './badge';
import { Button } from './button';
import {
    MorphingDialog,
    MorphingDialogClose,
    MorphingDialogContainer,
    MorphingDialogContent,
    MorphingDialogDescription,
    MorphingDialogImage,
    MorphingDialogMinimize,
    MorphingDialogSubtitle,
    MorphingDialogTitle,
    MorphingDialogTrigger,
    useMorphingDialog
} from './morphing-dialog';

export interface Project {
    name: string;
    author: string;
    description: string;
    tags: string[];
    imageUrl?: string;
}

interface ProjectCardProps {
    project: Project;
    presetWallId?: string | null;
    availableWalls?: Array<{
        id: string;
        name: string;
        connectedNodes: number;
        isBound?: boolean;
    }>;
    onLoadProject?: (wallId: string) => Promise<boolean | void>;
}

function ProjectCardDialogBody({
    project,
    onLoadProject,
    availableWalls = [],
    presetWallId
}: ProjectCardProps) {
    const { state, fullscreen } = useMorphingDialog();
    const [showWallPicker, setShowWallPicker] = useState(false);
    const [isLoadingWall, setIsLoadingWall] = useState(false);
    const [activeWallId, setActiveWallId] = useState<string | null>(null);
    const [controllerMounted, setControllerMounted] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const hasController = Boolean(activeWallId);
    const isFullscreen = state === 'fullscreen';

    const handleSelectWall = async (wallId: string) => {
        if (!onLoadProject) return;
        if (!wallId || wallId.trim().length === 0) {
            setErrorMessage('Invalid wall selection');
            return;
        }
        setIsLoadingWall(true);
        setErrorMessage(null);
        try {
            const ok = await onLoadProject(wallId);
            if (ok === false) return;
            setActiveWallId(wallId);
            setShowWallPicker(false);
            fullscreen();
        } catch (error: any) {
            setErrorMessage(error?.message ?? 'Could not load project on this wall');
        } finally {
            setIsLoadingWall(false);
        }
    };

    const handleLoadButton = async () => {
        if (isLoadingWall) return;
        if (presetWallId) {
            const exists = availableWalls.some((wall) => wall.id === presetWallId);
            if (exists) {
                await handleSelectWall(presetWallId);
                return;
            }
            setErrorMessage('Preset wall is not connected. Please select another wall.');
        }
        setShowWallPicker((prev) => !prev);
    };

    const panelClassName =
        isFullscreen && hasController
            ? 'grid-cols-[minmax(0,4fr)_minmax(320px,1fr)]'
            : 'grid-cols-[0fr_minmax(0,1fr)]';

    useEffect(() => {
        if (isFullscreen && hasController && !controllerMounted) {
            setControllerMounted(true);
        }
    }, [isFullscreen, hasController, controllerMounted]);

    const controllerUrl = useMemo(
        () => (activeWallId ? `/controller/?l=gallery&w=${encodeURIComponent(activeWallId)}` : ''),
        [activeWallId]
    );

    console.log('controllerUrl', controllerUrl);

    return (
        <>
            <div
                className={`grid h-full min-h-0 w-full ${panelClassName} transition-all duration-300`}
            >
                <div
                    className={`min-w-0 overflow-hidden border-r border-zinc-200 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-900/40 ${
                        isFullscreen && hasController
                            ? 'opacity-100'
                            : 'pointer-events-none opacity-0'
                    } transition-opacity duration-300`}
                >
                    {controllerMounted && hasController ? (
                        <iframe
                            title={`Controller for ${project.name}`}
                            src={controllerUrl}
                            className="h-full w-full border-0"
                        />
                    ) : null}
                </div>

                <div className="min-w-0">
                    <MorphingDialogImage
                        src={project.imageUrl}
                        alt={project.name}
                        state={'opened'}
                        className="h-52 w-full object-cover"
                    />
                    <div className="p-6">
                        <MorphingDialogTitle className="text-2xl text-zinc-950 dark:text-zinc-50">
                            {project.name}
                        </MorphingDialogTitle>
                        <MorphingDialogSubtitle className="text-zinc-700 dark:text-zinc-400">
                            {project.author}
                        </MorphingDialogSubtitle>

                        <div className="mt-4 flex flex-wrap gap-2">
                            {project.tags.map((tag) => (
                                <Badge key={tag} variant="outline">
                                    {tag}
                                </Badge>
                            ))}
                        </div>

                        <MorphingDialogDescription
                            disableLayoutAnimation
                            variants={{
                                initial: { opacity: 0, scale: 0.8, y: 100 },
                                animate: { opacity: 1, scale: 1, y: 0 },
                                exit: { opacity: 0, scale: 0.8, y: 100 }
                            }}
                        >
                            <p className="mt-2 text-zinc-500 dark:text-zinc-500">
                                {project.description}
                            </p>

                            {showWallPicker ? (
                                <div className="mt-5 rounded-md border border-zinc-200 p-2 dark:border-zinc-700">
                                    <div className="mb-2 text-xs font-medium text-muted-foreground">
                                        Select a wall
                                    </div>
                                    <div className="max-h-40 space-y-1 overflow-auto">
                                        {availableWalls.length > 0 ? (
                                            availableWalls.map((wall) => (
                                                <button
                                                    key={wall.id}
                                                    type="button"
                                                    disabled={isLoadingWall}
                                                    onClick={() => handleSelectWall(wall.id)}
                                                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:hover:bg-zinc-800"
                                                >
                                                    <span>{wall.name}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {wall.connectedNodes} node
                                                        {wall.connectedNodes !== 1 ? 's' : ''}
                                                        {wall.isBound ? ' · bound' : ''}
                                                    </span>
                                                </button>
                                            ))
                                        ) : (
                                            <div className="px-2 py-3 text-xs text-muted-foreground">
                                                No walls available
                                            </div>
                                        )}
                                    </div>
                                    {errorMessage ? (
                                        <div className="mt-2 text-xs text-red-500">
                                            {errorMessage}
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}

                            <Button
                                className="mt-5 w-full"
                                onClick={handleLoadButton}
                                disabled={isLoadingWall}
                            >
                                {isLoadingWall ? (
                                    <>
                                        <SpinnerGapIcon className="animate-spin" />
                                        Loading
                                    </>
                                ) : (
                                    <>
                                        Load project <ArrowRightIcon />
                                    </>
                                )}
                            </Button>
                        </MorphingDialogDescription>
                    </div>
                </div>
            </div>
            <MorphingDialogMinimize />
            <MorphingDialogClose className="text-zinc-50" />
        </>
    );
}

export function ProjectCard({
    project,
    onLoadProject,
    availableWalls,
    presetWallId
}: ProjectCardProps) {
    return (
        <MorphingDialog
            transition={{
                type: 'spring',
                bounce: 0.05,
                duration: 0.25
            }}
        >
            <MorphingDialogTrigger
                style={{
                    borderRadius: '12px'
                }}
                className="flex max-w-67.5 flex-col overflow-hidden border border-zinc-950/10 bg-white dark:border-zinc-50/10 dark:bg-zinc-900"
            >
                <MorphingDialogImage
                    src={project.imageUrl}
                    alt={project.name}
                    state={'closed'}
                    className="h-48 w-full object-cover"
                />
                <div className="flex grow flex-col justify-between p-3">
                    <div>
                        <div className="flex items-start justify-between">
                            <div className="text-left">
                                <MorphingDialogTitle className="text-zinc-950 dark:text-zinc-50">
                                    {project.name}
                                </MorphingDialogTitle>
                                <MorphingDialogSubtitle className="text-zinc-700 dark:text-zinc-400">
                                    {project.author}
                                </MorphingDialogSubtitle>
                            </div>
                            <button
                                type="button"
                                className="relative ml-1 flex h-6 w-6 shrink-0 scale-100 appearance-none items-center justify-center rounded-lg border border-zinc-950/10 text-zinc-500 transition-colors select-none hover:bg-zinc-100 hover:text-zinc-800 focus-visible:ring-2 active:scale-[0.98] dark:border-zinc-50/10 dark:bg-zinc-900 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 dark:focus-visible:ring-zinc-500"
                                aria-label="Open dialog"
                            >
                                <EyeIcon size={12} />
                            </button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                            {project.tags.slice(0, 3).map((tag) => (
                                <Badge key={tag} variant="secondary" className="text-xs">
                                    {tag}
                                </Badge>
                            ))}
                        </div>
                    </div>
                </div>
            </MorphingDialogTrigger>
            <MorphingDialogContainer>
                <MorphingDialogContent
                    style={{
                        borderRadius: '24px'
                    }}
                    className="pointer-events-auto relative flex h-auto w-full flex-col overflow-hidden border border-zinc-950/10 bg-white sm:w-[500px] dark:border-zinc-50/10 dark:bg-zinc-900"
                >
                    <ProjectCardDialogBody
                        project={project}
                        presetWallId={presetWallId}
                        availableWalls={availableWalls}
                        onLoadProject={onLoadProject}
                    />
                </MorphingDialogContent>
            </MorphingDialogContainer>
        </MorphingDialog>
    );
}
