'use client';

import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import { ListItemNode, ListNode } from '@lexical/list';
import { LexicalCollaboration } from '@lexical/react/LexicalCollaborationContext';
import { CollaborationPluginV2__EXPERIMENTAL as CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin';
import {
    InitialConfigType,
    InitialEditorStateType,
    LexicalComposer
} from '@lexical/react/LexicalComposer';
import {
    useLexicalComposerContext,
    createLexicalComposerContext
} from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import type { Provider } from '@lexical/yjs';
import { syncLexicalUpdateToYjsV2__EXPERIMENTAL as syncToYjs } from '@lexical/yjs';
import { LetterCircleP } from '@phosphor-icons/react/dist/ssr';
import { useAuth } from '@repo/auth/tanstack/hooks';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@repo/ui/components/dialog';
import { debounce, throttle } from '@tanstack/pacer';
import { $getRoot, type EditorState, type LexicalEditor } from 'lexical';
import { pack } from 'msgpackr';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Doc } from 'yjs';

import { useProjectFonts } from '~/hooks/useProjectFonts';
import { EditorEngine } from '~/lib/editorEngine';
import { useEditorStore } from '~/lib/editorStore';
import type { LayerWithEditorState } from '~/lib/types';
import { createCollaborativeAuthoringPipe, releaseProvider } from '~/lib/yjsState';

import { TextEditorToolbar } from './TextEditorToolbar';

interface TextEditorDialogProps {
    layerId: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const LEXICAL_NODES = [HeadingNode, QuoteNode, ListNode, ListItemNode];

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

export function TextEditorDialog({ layerId, open, onOpenChange }: TextEditorDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[95vh] max-w-fit flex-col gap-3 overflow-hidden p-4">
                <DialogTitle className="text-sm font-medium">Edit Text Layer</DialogTitle>
                <DialogDescription className="sr-only">Text Edit</DialogDescription>
                {open && <TextEditorInner layerId={layerId} />}
            </DialogContent>
        </Dialog>
    );
}

function ToolbarBridge({ onEditor }: { onEditor: (editor: LexicalEditor) => void }) {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
        onEditor(editor);
    }, [editor, onEditor]);
    return null;
}

function TextEditorInner({ layerId }: { layerId: number }) {
    const { user } = useAuth();
    const [lexicalEditor, setLexicalEditor] = useState<LexicalEditor | null>(null);
    const cursorsContainerRef = useRef<HTMLDivElement>(null);
    const projectId = useEditorStore((s) => s.projectId);
    const commitId = useEditorStore((s) => s.commitId);
    const activeSlideId = useEditorStore((s) => s.activeSlideId);
    const projectFonts = useProjectFonts(projectId ?? '');
    const initialLexicalConfig = useRef<InitialConfigType>(null);

    const textScope = useMemo(
        () =>
            commitId && activeSlideId
                ? `${projectId}_${commitId}_${activeSlideId}_${layerId}`
                : null,
        [projectId, commitId, activeSlideId, layerId]
    );

    const pipe = useMemo(() => {
        if (!textScope || !user) return null;
        const pipe = createCollaborativeAuthoringPipe(textScope, user);
        return pipe;
    }, [textScope, user]);
    const { provider, doc, idenfity } = pipe ?? {};

    useEffect(() => {
        return () => {
            if (textScope) {
                console.log('Unmounting text editor');
                releaseProvider(textScope);
            }
        };
    }, [textScope]);

    useEffect(() => {
        if (!provider || !doc) return;
        const onSync = (isSynced: boolean) => {
            if (!isSynced || !lexicalEditor) return;
            if (provider.awareness.getStates().size > 1) return;
            const root = doc.getXmlFragment('root');

            // Use a metadata map to prevent "Double Seeding" if two users join at once
            const meta = doc.getMap('metadata');

            const layer = useEditorStore.getState().layers.find((l) => l.numericId === layerId) as
                | Extract<LayerWithEditorState, { type: 'text' }>
                | undefined;
            if (root.length === 0 && layer?.textHtml /* && !meta.has('seeded') */) {
                console.log('[Yjs] Document is empty. Initializing seed...');

                // Mark as seeded globally immediately to "lock" the process
                meta.set('seeded', true);

                lexicalEditor.update(
                    () => {
                        try {
                            const parser = new DOMParser();
                            const dom = parser.parseFromString(layer.textHtml, 'text/html');
                            const nodes = $generateNodesFromDOM(lexicalEditor, dom);
                            const root = $getRoot();
                            root.clear();
                            root.append(...nodes);
                        } catch (e) {
                            console.error('[Yjs] Seeding failed', e);
                            meta.delete('seeded'); // Allow retry if it failed
                        }
                    },
                    { tag: 'history-merge' }
                );
            }
        };

        const onAwarenessUpdate = () => {
            console.log('Awareness update', provider.awareness.getStates());
        };
        provider.on('sync', onSync);
        provider.awareness.on('update', onAwarenessUpdate);

        return () => {
            provider.off('sync', onSync);
            provider.awareness.off('update', onAwarenessUpdate);
        };
    }, [textScope, provider, doc, lexicalEditor, layerId]);

    useEffect(() => {
        if (!lexicalEditor) return;
        const sendUpdate = throttle(
            (editorState: EditorState) =>
                editorState.read(() => {
                    const html = $generateHtmlFromNodes(lexicalEditor, null);
                    const engine = EditorEngine.getInstance();
                    const layer = useEditorStore
                        .getState()
                        .layers.find((l) => l.numericId === layerId) as
                        | Extract<LayerWithEditorState, { type: 'text' }>
                        | undefined;
                    if (!layer) return;
                    engine.sendJSON({
                        type: 'upsert_layer',
                        layer: {
                            ...layer,
                            textHtml: html
                        }
                    });
                }),
            { wait: 1000 }
        );

        const unregister = lexicalEditor.registerUpdateListener(
            ({ editorState, dirtyElements, dirtyLeaves, prevEditorState, tags }) => {
                // Skip saving if the update came from Yjs (remote) or the 'history-merge' (initial seed)
                if (tags.has('remote') || tags.has('history-merge')) return;

                // Only save if something actually changed
                if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;

                sendUpdate(editorState);

                return () => {
                    unregister();
                };
            }
        );
    }, [lexicalEditor, layerId]);

    if (!textScope) return <div>Text layer not found</div>;
    if (!doc || !provider || !idenfity)
        return <div>We experienced an issue opening the content</div>;

    if (!initialLexicalConfig.current) {
        initialLexicalConfig.current = {
            editorState: null,
            namespace: `text-editor-${layerId}`,
            nodes: LEXICAL_NODES,
            theme: LEXICAL_THEME,
            onError: (error: Error) => {
                console.error('Lexical error:', error);
            }
        };
    }

    return (
        <LexicalCollaboration>
            <LexicalComposer initialConfig={initialLexicalConfig.current}>
                <ToolbarBridge onEditor={setLexicalEditor} />
                {lexicalEditor && (
                    <>
                        <TextEditorToolbar editor={lexicalEditor} projectFonts={projectFonts} />
                        <div className="h-100 w-150 overflow-auto rounded-lg border border-border bg-black">
                            <div ref={cursorsContainerRef} className="relative h-100 w-full">
                                <RichTextPlugin
                                    contentEditable={
                                        <ContentEditable
                                            className="lexical-content-editable h-full w-full p-4 outline-none"
                                            style={{ fontSize: '48px', lineHeight: 1.3 }}
                                            autoFocus
                                        />
                                    }
                                    ErrorBoundary={LexicalErrorBoundary}
                                />
                            </div>
                        </div>
                        <ListPlugin />
                        <CollaborationPlugin
                            id={textScope}
                            doc={doc}
                            provider={provider}
                            cursorsContainerRef={cursorsContainerRef}
                            username={idenfity.name}
                            cursorColor={idenfity.color}
                        />
                    </>
                )}
            </LexicalComposer>
        </LexicalCollaboration>
    );
}

function LexicalErrorBoundary({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
