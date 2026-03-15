'use client';

import { MonitorIcon, SpinnerGapIcon } from '@phosphor-icons/react';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ControllerEngine } from '~/lib/controllerEngine';
import { $getCommit, $getProject } from '~/server/projects.fns';

export const Route = createFileRoute('/controller/')({
    ssr: 'data-only',
    component: ControllerApp
});

interface BindingStatus {
    bound: boolean;
    projectId?: string;
    slideId?: string;
}

interface SlideEntry {
    id: string;
    order: number;
    description: string;
}

function ControllerApp() {
    const wallId = useMemo(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('w');
    }, []);

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

    // Fetch slides when binding changes
    const loadSlides = useCallback(async (projectId: string) => {
        setLoadingSlides(true);
        try {
            const project = await $getProject({ data: { id: projectId } });
            if (!project?.headCommitId) return;
            const commit = await $getCommit({ data: { id: project.headCommitId } });
            if (!commit?.content?.slides) return;
            const commitSlides = commit.content.slides as Array<{
                id: string;
                order: number;
                layers: unknown[];
            }>;
            setSlides(
                commitSlides.map((s) => ({
                    id: s.id,
                    order: s.order,
                    description: `Slide ${s.order}`
                }))
            );
        } catch (e) {
            console.error('Failed to load slides:', e);
        } finally {
            setLoadingSlides(false);
        }
    }, []);

    useEffect(() => {
        if (binding.bound && binding.projectId) {
            loadSlides(binding.projectId);
        } else {
            setSlides([]);
        }
    }, [binding.bound, binding.projectId, loadSlides]);

    // HMR rehydrate
    useEffect(() => {
        if (window.__CONTROLLER_RELOADING__) {
            setTimeout(() => {
                engine?.sendJSON({ type: 'rehydrate_please' });
            }, 500);
            window.__CONTROLLER_RELOADING__ = false;
        }
    }, [engine]);

    if (!wallId) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-black text-white">
                <p className="text-muted-foreground">
                    Missing wall ID. Use <code>?w=WALL_ID</code> in the URL.
                </p>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col bg-black text-white">
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
                        <div className="mb-2 text-xs text-white/50">Slides ({slides.length})</div>
                        {slides.map((slide) => (
                            <button
                                key={slide.id}
                                onClick={() => {
                                    if (binding.projectId) {
                                        engine?.bindSlide(binding.projectId, slide.id);
                                    }
                                }}
                                className={`cursor-pointer rounded-lg border px-4 py-3 text-left transition-colors ${
                                    binding.slideId === slide.id
                                        ? 'border-green-500 bg-green-500/10'
                                        : 'border-white/10 hover:border-white/30 hover:bg-white/5'
                                }`}
                            >
                                <div className="text-sm font-medium">{slide.description}</div>
                                <div className="text-xs text-white/50">{slide.id}</div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// --- VITE HMR DEFENSE STRATEGY ---
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        window.__CONTROLLER_RELOADING__ = true;
    });
}
