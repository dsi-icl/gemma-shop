'use client';

import { CircleNotchIcon, MonitorIcon, SpinnerGapIcon } from '@phosphor-icons/react';
import { cn } from '@repo/ui/lib/utils';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ControllerEngine } from '~/lib/controllerEngine';
import { $getCommit } from '~/server/projects.fns';

export const Route = createFileRoute('/controller/')({
    component: ControllerApp
});

interface BindingStatus {
    bound: boolean;
    projectId?: string;
    commitId?: string;
    slideId?: string;
}

interface SlideEntry {
    id: string;
    name: string;
    order: number;
    layerCount: number;
}

function ControllerApp() {
    const isClient = typeof window !== 'undefined';
    const { wallId, mountLocation } = useMemo(() => {
        if (!isClient) return { wallId: undefined, mountLocation: undefined };
        const params = new URLSearchParams(window.location.search);
        return { wallId: params.get('w'), mountLocation: params.get('l') };
    }, [isClient]);

    const shouldHideHeaderAndFooter = mountLocation === 'gallery';
    const engine = useMemo(() => (wallId ? ControllerEngine.getInstance(wallId) : null), [wallId]);

    const [binding, setBinding] = useState<BindingStatus>({ bound: false });
    const [slides, setSlides] = useState<SlideEntry[]>([]);
    const [loadingSlides, setLoadingSlides] = useState(false);

    // Listen for binding status from bus
    useEffect(() => {
        if (!engine) return;
        return engine.onBindingStatus((status) => {
            setBinding(status);
        });
    }, [engine]);

    // Fetch slides from the bound commit
    const loadSlides = useCallback(async (commitId: string) => {
        setLoadingSlides(true);
        try {
            const commit = await $getCommit({ data: { id: commitId } });
            if (!commit?.content?.slides) return;
            const commitSlides = commit.content.slides;
            setSlides(
                commitSlides.map((s) => ({
                    ...s,
                    layerCount: s.layers.length
                }))
            );
        } catch (e) {
            console.error('Failed to load slides:', e);
        } finally {
            setLoadingSlides(false);
        }
    }, []);

    useEffect(() => {
        if (binding.bound && binding.commitId) {
            loadSlides(binding.commitId);
        } else {
            setSlides([]);
        }
    }, [binding.bound, binding.commitId, loadSlides]);

    // Listen for live slide list updates from other editors
    useEffect(() => {
        if (!engine) return;
        return engine.onSlidesUpdated((updatedSlides) => {
            setSlides((prev) =>
                updatedSlides.map((s) => ({
                    ...s,
                    layerCount: prev.find((existing) => existing.id === s.id)?.layerCount ?? 0
                }))
            );
        });
    }, [engine]);

    // HMR rehydrate
    useEffect(() => {
        if (window.__CONTROLLER_RELOADING__) {
            setTimeout(() => {
                engine?.sendJSON({ type: 'rehydrate_please' });
            }, 500);
            window.__CONTROLLER_RELOADING__ = false;
        }
    }, [engine]);

    if (wallId === undefined) {
        return (
            <div
                className={cn(
                    'container flex min-h-svh min-w-full flex-col items-center justify-center bg-background',
                    shouldHideHeaderAndFooter
                        ? 'fixed top-0 right-0 bottom-0 left-0 z-100 h-full w-full pt-0 pb-0'
                        : 'pt-18 pb-13'
                )}
            >
                <div className="flex h-full w-full items-center justify-center">
                    <CircleNotchIcon className="animate-spin" />
                </div>
            </div>
        );
    }

    if (!wallId) {
        return (
            <div
                className={cn(
                    'container flex min-h-svh min-w-full flex-col items-center justify-center bg-background',
                    shouldHideHeaderAndFooter
                        ? 'fixed top-0 right-0 bottom-0 left-0 z-100 h-full w-full pt-0 pb-0'
                        : 'pt-18 pb-13'
                )}
            >
                <div className="flex h-full w-full items-center justify-center">
                    <p className="text-muted-foreground">
                        Missing wall ID. Use <code>?w=WALL_ID</code> in the URL.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div
            className={cn(
                'container flex min-h-svh min-w-full flex-col',
                shouldHideHeaderAndFooter
                    ? 'fixed top-0 right-0 bottom-0 left-0 z-50 h-full w-full pt-0 pb-0'
                    : 'pt-18 pb-13'
            )}
        >
            <div className="flex h-full flex-col bg-black text-white">
                {/* Header */}
                <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                    <MonitorIcon size={20} weight="fill" className="text-green-500" />
                    <span className="text-sm font-medium">Controller</span>
                    <span className="text-xs text-white/50">{wallId}</span>
                </div>

                {/* Content */}
                <div className="flex-1 p-4">
                    {!binding.bound ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-12 text-white/50">
                            <MonitorIcon size={32} />
                            <p className="text-sm">No project loaded on this wall</p>
                            <p className="text-xs">Load a project from the gallery or editor</p>
                        </div>
                    ) : loadingSlides ? (
                        <div className="flex items-center justify-center py-12">
                            <SpinnerGapIcon size={24} className="animate-spin text-white/50" />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <div className="mb-2 text-xs text-white/50">
                                Slides ({slides.length})
                            </div>
                            {slides
                                .sort((a, b) => a.order - b.order)
                                .map((slide, idx) => (
                                    <button
                                        key={slide.id}
                                        onClick={() => {
                                            if (binding.projectId && binding.commitId) {
                                                engine?.bindSlide(
                                                    binding.projectId,
                                                    binding.commitId,
                                                    slide.id
                                                );
                                            }
                                        }}
                                        className={`cursor-pointer rounded-lg border px-4 py-3 text-left transition-colors ${
                                            binding.slideId === slide.id
                                                ? 'border-green-500 bg-green-500/10'
                                                : 'border-white/10 hover:border-white/30 hover:bg-white/5'
                                        }`}
                                    >
                                        <div className="text-sm font-medium">
                                            Slide {idx + 1}: {slide.name ?? 'Untitled'}
                                        </div>
                                        <div className="text-xs text-white/50">
                                            {slide.layerCount} layer
                                            {slide.layerCount !== 1 ? 's' : ''}
                                        </div>
                                    </button>
                                ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// --- VITE HMR DEFENSE STRATEGY ---
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        if (typeof window !== 'undefined') window.__CONTROLLER_RELOADING__ = true;
    });
}
