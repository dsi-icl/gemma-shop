'use client';

import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import { ListItemNode, ListNode } from '@lexical/list';
import { LexicalCollaboration } from '@lexical/react/LexicalCollaborationContext';
import { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import type { Provider } from '@lexical/yjs';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@repo/ui/components/dialog';
import { throttle } from '@tanstack/pacer';
import { $getRoot, type EditorState, type LexicalEditor } from 'lexical';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Doc } from 'yjs';

import { useProjectFonts } from '~/hooks/useProjectFonts';
import { EditorEngine } from '~/lib/editorEngine';
import { useEditorStore } from '~/lib/editorStore';
import type { LayerWithEditorState } from '~/lib/types';
import { getOrCreateProvider, releaseProvider } from '~/lib/yjsState';

import { TextEditorToolbar } from './TextEditorToolbar';

type TextLayer = Extract<LayerWithEditorState, { type: 'text' }>;

interface TextEditorDialogProps {
    layer: TextLayer;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const LEXICAL_NODES = [HeadingNode, QuoteNode, ListNode, ListItemNode];

/** Max dialog viewport for the scaled editing surface */
const MAX_DIALOG_WIDTH = 900;

const LEXICAL_THEME = {
    root: 'lexical-root',
    paragraph: 'lexical-paragraph',
    heading: {
        h1: 'lexical-h1',
        h2: 'lexical-h2',
        h3: 'lexical-h3',
        h4: 'lexical-h4'
    },
    text: {
        bold: 'lexical-bold',
        italic: 'lexical-italic',
        underline: 'lexical-underline',
        strikethrough: 'lexical-strikethrough'
    },
    list: {
        ul: 'lexical-ul',
        ol: 'lexical-ol',
        listitem: 'lexical-li'
    }
};

function ToolbarBridge({ onEditor }: { onEditor: (editor: LexicalEditor) => void }) {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
        onEditor(editor);
    }, [editor, onEditor]);
    return null;
}

/** Debounced HTML export → bus broadcast for wall rendering */
function BusSyncPlugin({ layer }: { layer: TextLayer }) {
    const handleChange = useCallback(
        (_editorState: EditorState, editor: LexicalEditor) =>
            throttle(
                () => {
                    editor.read(() => {
                        const html = $generateHtmlFromNodes(editor);
                        if (html === layer.textHtml) return;

                        // Update local store
                        const store = useEditorStore.getState();
                        const updated = { ...layer, textHtml: html };
                        store.upsertLayer(updated);

                        // Broadcast to bus → wall
                        const engine = EditorEngine.getInstance();
                        engine.sendJSON({
                            type: 'upsert_layer',
                            origin: 'textEditor',
                            layer: updated
                        });
                        store.markDirty();
                    });
                },
                {
                    wait: 100
                }
            ),
        [layer]
    );

    return <OnChangePlugin onChange={handleChange} />;
}

export function TextEditorDialog({ layer, open, onOpenChange }: TextEditorDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[95vh] max-w-fit flex-col gap-3 overflow-hidden p-4">
                <DialogTitle className="text-sm font-medium">Edit Text Layer</DialogTitle>
                <DialogDescription className="sr-only">Text Edit</DialogDescription>
                {/* Only mount the editor when open — ensures clean Lexical + Yjs lifecycle */}
                {open && <TextEditorInner layer={layer} />}
            </DialogContent>
        </Dialog>
    );
}

function TextEditorInner({ layer }: { layer: TextLayer }) {
    const [lexicalEditor, setLexicalEditor] = useState<LexicalEditor | null>(null);
    const cursorsContainerRef = useRef<HTMLDivElement>(null);
    const projectId = useEditorStore((s) => s.projectId);
    const commitId = useEditorStore((s) => s.commitId);
    const activeSlideId = useEditorStore((s) => s.activeSlideId);
    const projectFonts = useProjectFonts(projectId ?? '');

    // Stable random identity for this editor session
    const [identity] = useState(() => ({
        name: `Editor ${Math.floor(Math.random() * 1000)}`,
        color: `#${Math.floor(Math.random() * 0xffffff)
            .toString(16)
            .padStart(6, '0')}`
    }));

    // textScope for Yjs: commitId/slideId/layerNumericId
    const textScope = useMemo(
        () =>
            commitId && activeSlideId ? `${commitId}/${activeSlideId}/${layer.numericId}` : null,
        [commitId, activeSlideId, layer.numericId]
    );

    // Compute scale to fit the wall-resolution editing surface in the dialog
    // TODO overhaul this poor heuristic, we need something much much better
    const dialogScale = useMemo(() => {
        return Math.min(1, MAX_DIALOG_WIDTH / layer.config.width);
    }, [layer.config.width]);

    const scaledWidth = layer.config.width * dialogScale;
    const scaledHeight = layer.config.height * dialogScale;

    // Cleanup Yjs provider on unmount (dialog close)
    useEffect(() => {
        return () => {
            if (textScope) {
                releaseProvider(textScope);
            }
        };
    }, [textScope]);

    const initialConfig = useMemo(
        () => ({
            editorState: null,
            namespace: `text-editor-${layer.numericId}`,
            nodes: LEXICAL_NODES,
            theme: LEXICAL_THEME,
            onError: (error: Error) => {
                console.error('Lexical error:', error);
            }
        }),
        [layer.numericId]
    );

    const providerFactory = useCallback((id: string, yjsDocMap: Map<string, Doc>): Provider => {
        const { doc, provider } = getOrCreateProvider(id);
        yjsDocMap.set(id, doc);
        return provider as unknown as Provider;
    }, []);

    const [mountHtml] = useState(() => layer.textHtml);

    return (
        <LexicalCollaboration>
            <LexicalComposer initialConfig={initialConfig}>
                <ToolbarBridge onEditor={setLexicalEditor} />

                {lexicalEditor && (
                    <TextEditorToolbar editor={lexicalEditor} projectFonts={projectFonts} />
                )}
                <div
                    className="overflow-auto rounded-lg border border-border bg-black"
                    style={{
                        width: scaledWidth + 2,
                        height: scaledHeight + 2
                    }}
                >
                    <div
                        ref={cursorsContainerRef}
                        style={{
                            position: 'relative',
                            width: layer.config.width,
                            height: layer.config.height,
                            transform: `scale(${dialogScale})`,
                            transformOrigin: 'top left'
                        }}
                    >
                        <RichTextPlugin
                            contentEditable={
                                <ContentEditable
                                    className="lexical-content-editable h-full w-full p-4 outline-none"
                                    style={{ fontSize: '48px', lineHeight: 1.3 }}
                                />
                            }
                            ErrorBoundary={LexicalErrorBoundary}
                        />
                    </div>
                </div>

                <ListPlugin />
                <BusSyncPlugin layer={layer} />
                {textScope ? (
                    <CollaborationPlugin
                        id={textScope}
                        providerFactory={providerFactory}
                        shouldBootstrap
                        cursorsContainerRef={cursorsContainerRef}
                        username={identity.name}
                        cursorColor={identity.color}
                        initialEditorState={
                            mountHtml
                                ? (editor: LexicalEditor) => {
                                      const parser = new DOMParser();
                                      const dom = parser.parseFromString(mountHtml, 'text/html');
                                      const nodes = $generateNodesFromDOM(editor, dom);
                                      const root = $getRoot();
                                      root.clear();
                                      root.append(...nodes);
                                  }
                                : undefined
                        }
                    />
                ) : (
                    // Fallback: no Yjs if scope unavailable, init from HTML
                    // TODO: It probably makes sens to init from HTML all the time ?
                    <HtmlInitPlugin html={layer.textHtml} />
                )}
            </LexicalComposer>
        </LexicalCollaboration>
    );
}

function LexicalErrorBoundary({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}

/** Fallback initializer when Yjs is not available */
function HtmlInitPlugin({ html }: { html: string }) {
    const [editor] = useLexicalComposerContext();
    const initialized = useRef(false);

    useEffect(() => {
        if (initialized.current || !html) return;
        initialized.current = true;

        editor.update(() => {
            const parser = new DOMParser();
            const dom = parser.parseFromString(html, 'text/html');
            const nodes = $generateNodesFromDOM(editor, dom);
            const root = $getRoot();
            root.clear();
            root.append(...nodes);
        });
    }, [editor, html]);

    return null;
}
