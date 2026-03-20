import { LexicalCollaboration } from '@lexical/react/LexicalCollaborationContext';
import { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useAuth } from '@repo/auth/tanstack/hooks';
import { useCallback, useRef, useState } from 'react';
import * as Y from 'yjs';

import { useEditorStore } from '~/lib/editorStore';

import { createWebsocketProvider } from './providers';
import { TextEditor } from './TextEditor';
import theme from './theme';

const editorConfig = {
    editorState: null,
    namespace: 'Gemma Shop Text Bonanza',
    nodes: [],
    onError(error: Error) {
        throw error;
    },
    theme
};

export function CollaborativeEditor({ layerId }: { layerId: number }) {
    const { user } = useAuth();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const textEditScope = useEditorStore(
        (s) => `${s.projectId}_${s.commitId}_${s.activeSlideId}_${layerId}`
    );
    const [userColor] = useState(
        () =>
            `#${Math.floor(Math.random() * 0xffffff)
                .toString(16)
                .padStart(6, '0')}`
    );

    const providerFactory = useCallback(
        (id: string, yjsDocMap: Map<string, Y.Doc>) => {
            console.log('providerFactory id:', id, layerId);
            const provider = createWebsocketProvider(id, yjsDocMap);
            return provider;
        },
        [layerId]
    );

    if (!user) return null;

    return (
        <div ref={containerRef}>
            <LexicalCollaboration>
                <LexicalComposer initialConfig={editorConfig}>
                    <CollaborationPlugin
                        id={textEditScope}
                        providerFactory={providerFactory}
                        shouldBootstrap={false}
                        username={user.email}
                        cursorColor={userColor}
                        cursorsContainerRef={containerRef}
                    />
                    <TextEditor />
                </LexicalComposer>
            </LexicalCollaboration>
        </div>
    );
}
