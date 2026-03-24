import { CodeHighlightNode, CodeNode, $createCodeNode } from '@lexical/code';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { Button } from '@repo/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@repo/ui/components/dialog';
import { $createTextNode, $getRoot } from 'lexical';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useEditorStore } from '~/lib/editorStore';
import type { Layer, LayerWithEditorState } from '~/lib/types';
import { $getCommit } from '~/server/projects.fns';

import theme from './editor/theme';

interface SlidesJsonDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface SnapshotSlide {
    id: string;
    order: number;
    name: string;
    layers: Layer[];
}

interface SnapshotPayload {
    type: 'editor_json_snapshot';
    generatedAt: string;
    projectId: string;
    commitId: string;
    activeSlideId: string | null;
    slides: SnapshotSlide[];
}

interface CommitSlide {
    id: string;
    order?: number;
    name?: string;
    layers?: unknown[];
}

function isTransientLayer(layer: unknown): boolean {
    if (!layer || typeof layer !== 'object') return false;
    const maybe = layer as Record<string, unknown>;
    if (maybe.transient === true || maybe.isTransient === true || maybe.ephemeral === true) {
        return true;
    }
    const origin = typeof maybe.origin === 'string' ? maybe.origin : '';
    return origin.startsWith('controller:') || origin.startsWith('transient:');
}

function toSerializableLayer(layer: unknown): Layer | null {
    if (!layer || typeof layer !== 'object') return null;
    const withClientFields = layer as LayerWithEditorState & Record<string, unknown>;
    const { progress: _progress, isUploading: _isUploading, ...rest } = withClientFields;
    if (isTransientLayer(rest)) return null;
    return rest as Layer;
}

function JsonContentPlugin({ json }: { json: string }) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        if (typeof window === 'undefined') return;
        let unsubscribe: (() => void) | null = null;
        let cancelled = false;

        void (async () => {
            try {
                await import('prismjs');
                await import('prismjs/components/prism-json');
                const { registerCodeHighlighting } = await import('@lexical/code-prism');
                if (cancelled) return;
                unsubscribe = registerCodeHighlighting(editor);
            } catch {
                // Keep rendering plain code when Prism fails to initialize.
            }
        })();

        return () => {
            cancelled = true;
            unsubscribe?.();
        };
    }, [editor]);

    useEffect(() => {
        editor.update(() => {
            const root = $getRoot();
            root.clear();
            const codeNode = $createCodeNode('json');
            codeNode.append($createTextNode(json));
            root.append(codeNode);
        });
    }, [editor, json]);

    return null;
}

function JsonCodeViewer({ json }: { json: string }) {
    const initialConfig = useMemo(
        () => ({
            namespace: 'GemmaSlidesJsonViewer',
            editable: false,
            theme,
            nodes: [CodeNode, CodeHighlightNode],
            onError(error: Error) {
                throw error;
            }
        }),
        []
    );

    return (
        <div className="overflow-auto rounded-md border border-border bg-muted/20">
            <div className="min-h-80 p-2">
                <LexicalComposer initialConfig={initialConfig}>
                    <RichTextPlugin
                        contentEditable={
                            <ContentEditable
                                className="editor-input min-h-[60vh] w-full p-0 font-mono text-xs whitespace-pre outline-none"
                                spellCheck={false}
                            />
                        }
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <JsonContentPlugin json={json} />
                </LexicalComposer>
            </div>
        </div>
    );
}

export function SlidesJsonDialog({ open, onOpenChange }: SlidesJsonDialogProps) {
    const projectId = useEditorStore((s) => s.projectId);
    const commitId = useEditorStore((s) => s.commitId);
    const activeSlideId = useEditorStore((s) => s.activeSlideId);
    const slides = useEditorStore((s) => s.slides);
    const layers = useEditorStore((s) => s.layers);

    const [jsonPayload, setJsonPayload] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        if (!projectId || !commitId) {
            setError('Missing project or commit context.');
            setJsonPayload('');
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        void (async () => {
            try {
                const commit = await $getCommit({ data: { id: commitId } });
                const commitSlides = ((commit?.content?.slides as CommitSlide[] | undefined) ?? [])
                    .map((slide) => ({
                        id: slide.id,
                        order: slide.order,
                        name: slide.name,
                        layers: (slide.layers ?? [])
                            .map((layer) => toSerializableLayer(layer))
                            .filter((layer): layer is Layer => layer !== null)
                    }))
                    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

                const slideMetaById = new Map(slides.map((s) => [s.id, s]));
                const liveActiveLayers = Array.from(layers.values())
                    .map((layer) => toSerializableLayer(layer))
                    .filter((layer): layer is Layer => layer !== null)
                    .sort((a, b) => a.config.zIndex - b.config.zIndex);

                let activeReplaced = false;
                const mergedSlides = commitSlides.map((slide, index) => {
                    const meta = slideMetaById.get(slide.id);
                    const nextSlide: SnapshotSlide = {
                        id: slide.id,
                        order: slide.order ?? meta?.order ?? index,
                        name: slide.name ?? meta?.name ?? `Slide ${(slide.order ?? index) + 1}`,
                        layers: slide.layers
                    };
                    if (activeSlideId && slide.id === activeSlideId) {
                        activeReplaced = true;
                        nextSlide.layers = liveActiveLayers;
                    }
                    return nextSlide;
                });

                if (activeSlideId && !activeReplaced) {
                    const meta = slideMetaById.get(activeSlideId);
                    mergedSlides.push({
                        id: activeSlideId,
                        order: meta?.order ?? mergedSlides.length,
                        name: meta?.name ?? `Slide ${(meta?.order ?? mergedSlides.length) + 1}`,
                        layers: liveActiveLayers
                    });
                }

                mergedSlides.sort((a, b) => a.order - b.order);

                const payload: SnapshotPayload = {
                    type: 'editor_json_snapshot',
                    generatedAt: new Date().toISOString(),
                    projectId,
                    commitId,
                    activeSlideId,
                    slides: mergedSlides
                };

                if (!cancelled) {
                    setJsonPayload(JSON.stringify(payload, null, 2));
                }
            } catch (e) {
                if (!cancelled) {
                    setJsonPayload('');
                    setError(e instanceof Error ? e.message : 'Failed to build JSON snapshot.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [open, projectId, commitId, activeSlideId, slides, layers]);

    const handleCopy = async () => {
        if (!jsonPayload) return;
        try {
            await navigator.clipboard.writeText(jsonPayload);
            toast.success('JSON copied to clipboard');
        } catch {
            toast.error('Failed to copy JSON');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[95vh] max-w-5xl flex-col gap-3 overflow-hidden p-4">
                <div className="flex items-center justify-between gap-2">
                    <DialogTitle className="text-sm font-medium">Render JSON</DialogTitle>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCopy}
                        disabled={!jsonPayload}
                    >
                        Copy JSON
                    </Button>
                </div>
                <DialogDescription className="text-xs text-muted-foreground">
                    You can see a complete view of the composition of slides in this presentation.
                </DialogDescription>
                {loading ? (
                    <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
                        Building snapshot...
                    </div>
                ) : error ? (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                        {error}
                    </div>
                ) : (
                    <JsonCodeViewer json={jsonPayload} />
                )}
            </DialogContent>
        </Dialog>
    );
}
