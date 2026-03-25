import {
    ArrowClockwiseIcon,
    ArrowRightIcon,
    CircleNotchIcon,
    EyeIcon
} from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
    blurhash?: string;
    sizes?: number[];
    images?: Array<{
        src: string;
        blurhash?: string;
        sizes?: number[];
    }>;
    customControlUrl?: string;
}

interface ProjectCardProps {
    project: Project;
    autoOpenSignal?: string | number | null;
    forceDemoteFullscreenSignal?: string | number | null;
    forceCloseMinimizedSignal?: string | number | null;
    forceCloseSignal?: string | number | null;
    presetWallId?: string | null;
    availableWalls?: Array<{
        id: string;
        name: string;
        connectedNodes: number;
        isBound?: boolean;
    }>;
    onLoadProject?: (wallId: string) => Promise<boolean | void>;
    onWallRebootRequest?: (wallId: string) => Promise<boolean | void> | boolean | void;
    onWallUnbindRequest?: (wallId: string) => Promise<boolean | void> | boolean | void;
    onActiveWallIdChange?: (wallId: string | null) => void;
}

function buildControllerUrl(customControlUrl: string | undefined, wallId: string): string {
    const fallback = `/controller/?l=gallery&w=${encodeURIComponent(wallId)}`;
    const raw = customControlUrl?.trim();
    if (!raw) return fallback;

    const withTokens = raw
        .replaceAll('{wallId}', encodeURIComponent(wallId))
        .replaceAll('{mountLocation}', 'gallery');

    try {
        const isAbsolute = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(withTokens);
        const url = new URL(withTokens, 'http://local');

        if (!url.searchParams.has('l')) url.searchParams.set('l', 'gallery');
        if (!url.searchParams.has('w')) url.searchParams.set('w', wallId);

        if (isAbsolute) return url.toString();
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return fallback;
    }
}

function ProjectCardDialogBody({
    project,
    autoOpenSignal,
    onLoadProject,
    onWallRebootRequest,
    onActiveWallIdChange,
    availableWalls = [],
    presetWallId
}: ProjectCardProps) {
    const { state, fullscreen } = useMorphingDialog();
    const loadInFlightRef = useRef(false);
    const [showWallPicker, setShowWallPicker] = useState(false);
    const [isLoadingWall, setIsLoadingWall] = useState(false);
    const [activeWallId, setActiveWallId] = useState<string | null>(null);
    const [controllerReloadNonce, setControllerReloadNonce] = useState(0);
    const [isRefreshingController, setIsRefreshingController] = useState(false);
    const [refreshRebootDone, setRefreshRebootDone] = useState(false);
    const [refreshIframeLoaded, setRefreshIframeLoaded] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const hasController = Boolean(activeWallId);
    const isFullscreen = state === 'fullscreen';

    const handleSelectWall = async (wallId: string) => {
        if (!onLoadProject) return;
        if (loadInFlightRef.current) return;
        if (!wallId || wallId.trim().length === 0) {
            setErrorMessage('Invalid wall selection');
            return;
        }
        loadInFlightRef.current = true;
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
            loadInFlightRef.current = false;
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
        if (!autoOpenSignal) return;
        if (!presetWallId) return;
        setActiveWallId(presetWallId);
    }, [autoOpenSignal, presetWallId]);

    useEffect(() => {
        if (!isFullscreen) return;
        if (!presetWallId) return;
        if (activeWallId === presetWallId) return;
        setActiveWallId(presetWallId);
    }, [isFullscreen, presetWallId, activeWallId]);

    useEffect(() => {
        onActiveWallIdChange?.(activeWallId);
    }, [activeWallId, onActiveWallIdChange]);

    const controllerUrl = useMemo(() => {
        if (!activeWallId) return '';
        const baseUrl = buildControllerUrl(project.customControlUrl, activeWallId);
        return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}_r=${controllerReloadNonce}`;
    }, [activeWallId, project.customControlUrl, controllerReloadNonce]);

    const handleWallRebootRequest = async () => {
        if (!activeWallId || isRefreshingController) return;
        setErrorMessage(null);
        setRefreshRebootDone(false);
        setRefreshIframeLoaded(false);
        setControllerReloadNonce((prev) => prev + 1);
        setIsRefreshingController(true);
        try {
            const ok = onWallRebootRequest
                ? await Promise.resolve(onWallRebootRequest(activeWallId))
                : true;
            if (ok === false) setErrorMessage('Could not refresh wall screens');
        } catch (error: any) {
            setErrorMessage(error?.message ?? 'Could not refresh wall screens');
        }
        setRefreshRebootDone(true);
    };

    useEffect(() => {
        if (!isRefreshingController) return;
        if (!refreshRebootDone) return;
        if (!refreshIframeLoaded) return;
        setIsRefreshingController(false);
    }, [isRefreshingController, refreshRebootDone, refreshIframeLoaded]);

    return (
        <>
            <div
                className={`grid h-full min-h-0 w-full ${panelClassName} transition-all duration-300`}
            >
                <div
                    className={`min-w-0 overflow-hidden border-r ${
                        isFullscreen && hasController
                            ? 'opacity-100'
                            : 'pointer-events-none opacity-0'
                    } transition-opacity duration-300`}
                >
                    {hasController ? (
                        <iframe
                            title={`Controller for ${project.name}`}
                            src={controllerUrl}
                            className="h-full w-full border-0 bg-background"
                            onLoad={() => {
                                if (isRefreshingController) {
                                    setRefreshIframeLoaded(true);
                                }
                            }}
                        />
                    ) : null}
                </div>

                <div className="min-w-0">
                    <MorphingDialogImage
                        src={project.imageUrl}
                        blurhash={project.blurhash}
                        sizes={project.sizes}
                        images={project.images}
                        alt={project.name}
                        state={'opened'}
                        className="h-52 w-full object-cover"
                    />
                    <div className="p-6">
                        <MorphingDialogTitle className="text-2xl">
                            {project.name}
                        </MorphingDialogTitle>
                        <MorphingDialogSubtitle className="text-sm">
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
                            <p className="mt-2 opacity-50">{project.description}</p>

                            {showWallPicker ? (
                                <div className="mt-5 rounded-md border">
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
                                                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm transition-colors"
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

                            {!isFullscreen ? (
                                <Button
                                    className="mt-5 w-full"
                                    onClick={handleLoadButton}
                                    disabled={isLoadingWall}
                                >
                                    {isLoadingWall ? (
                                        <CircleNotchIcon className="animate-spin" />
                                    ) : (
                                        <>
                                            Load project <ArrowRightIcon />
                                        </>
                                    )}
                                </Button>
                            ) : null}
                        </MorphingDialogDescription>
                    </div>
                </div>
            </div>

            {isFullscreen && hasController ? (
                <motion.button
                    onClick={handleWallRebootRequest}
                    disabled={isRefreshingController}
                    type="button"
                    aria-label="Minimize dialog"
                    className="absolute top-6 right-26 z-10"
                    initial="initial"
                    animate="animate"
                    exit="exit"
                >
                    {isRefreshingController ? (
                        <CircleNotchIcon size={24} className="animate-spin" />
                    ) : (
                        <ArrowClockwiseIcon size={24} />
                    )}
                </motion.button>
            ) : null}
            <MorphingDialogMinimize />
            <MorphingDialogClose />
        </>
    );
}

export function ProjectCard({
    project,
    autoOpenSignal,
    forceDemoteFullscreenSignal,
    forceCloseMinimizedSignal,
    forceCloseSignal,
    onLoadProject,
    onWallRebootRequest,
    onWallUnbindRequest,
    availableWalls,
    presetWallId
}: ProjectCardProps) {
    const activeWallIdRef = useRef<string | null>(null);
    const prevDialogStateRef = useRef<'closed' | 'expanded' | 'fullscreen' | 'minimized'>('closed');
    const skipUnbindOnNextCloseRef = useRef(false);
    const lastExternalCloseMinimizedSignalRef = useRef<string | number | null | undefined>(
        undefined
    );
    const lastExternalCloseSignalRef = useRef<string | number | null | undefined>(undefined);

    useEffect(() => {
        if (forceCloseMinimizedSignal === null || forceCloseMinimizedSignal === undefined) {
            lastExternalCloseMinimizedSignalRef.current = forceCloseMinimizedSignal;
            return;
        }
        if (Object.is(lastExternalCloseMinimizedSignalRef.current, forceCloseMinimizedSignal))
            return;
        lastExternalCloseMinimizedSignalRef.current = forceCloseMinimizedSignal;
        if (prevDialogStateRef.current === 'minimized') {
            skipUnbindOnNextCloseRef.current = true;
        }
    }, [forceCloseMinimizedSignal]);

    useEffect(() => {
        if (forceCloseSignal === null || forceCloseSignal === undefined) {
            lastExternalCloseSignalRef.current = forceCloseSignal;
            return;
        }
        if (Object.is(lastExternalCloseSignalRef.current, forceCloseSignal)) return;
        lastExternalCloseSignalRef.current = forceCloseSignal;
        if (
            prevDialogStateRef.current === 'fullscreen' ||
            prevDialogStateRef.current === 'minimized'
        ) {
            skipUnbindOnNextCloseRef.current = true;
        }
    }, [forceCloseSignal]);

    const handleActiveWallIdChange = useCallback((wallId: string | null) => {
        activeWallIdRef.current = wallId;
    }, []);

    const handleDialogStateChange = useCallback(
        (state: 'closed' | 'expanded' | 'fullscreen' | 'minimized') => {
            const prev = prevDialogStateRef.current;
            prevDialogStateRef.current = state;

            if (state !== 'closed' || prev === 'closed') return;
            const activeWallId = activeWallIdRef.current;
            if (skipUnbindOnNextCloseRef.current) {
                skipUnbindOnNextCloseRef.current = false;
                activeWallIdRef.current = null;
                return;
            }
            if (!activeWallId || !onWallUnbindRequest) return;
            void Promise.resolve(onWallUnbindRequest(activeWallId));
            activeWallIdRef.current = null;
        },
        [onWallUnbindRequest]
    );

    return (
        <MorphingDialog
            forceOpenSignal={autoOpenSignal}
            forceDemoteFullscreenSignal={forceDemoteFullscreenSignal}
            forceCloseMinimizedSignal={forceCloseMinimizedSignal}
            forceCloseSignal={forceCloseSignal}
            onStateChange={handleDialogStateChange}
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
                className="flex w-full flex-col overflow-hidden border"
            >
                <MorphingDialogImage
                    src={project.imageUrl}
                    blurhash={project.blurhash}
                    sizes={project.sizes}
                    images={project.images}
                    alt={project.name}
                    state={'closed'}
                    className="h-48 w-full object-cover"
                />
                <div className="flex w-full grow flex-col justify-between p-3">
                    <div>
                        <div className="flex items-start justify-between">
                            <div className="text-left">
                                <MorphingDialogTitle>{project.name}</MorphingDialogTitle>
                                <MorphingDialogSubtitle className="text-sm">
                                    {project.author}
                                </MorphingDialogSubtitle>
                            </div>
                            <span
                                aria-hidden="true"
                                className="relative ml-1 flex h-6 w-6 shrink-0 scale-100 items-center justify-center rounded-lg border"
                            >
                                <EyeIcon size={12} />
                            </span>
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
                    className="pointer-events-auto relative mx-auto flex h-auto w-md flex-col overflow-hidden border"
                    minimizedPreviewBlurhash={project.blurhash}
                    minimizedLabel={project.name}
                >
                    <ProjectCardDialogBody
                        project={project}
                        presetWallId={presetWallId}
                        availableWalls={availableWalls}
                        onLoadProject={onLoadProject}
                        onWallRebootRequest={onWallRebootRequest}
                        onActiveWallIdChange={handleActiveWallIdChange}
                    />
                </MorphingDialogContent>
            </MorphingDialogContainer>
        </MorphingDialog>
    );
}
