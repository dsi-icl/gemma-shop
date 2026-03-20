import { useEditorStore } from '~/lib/editorStore';

import { ConnectionBanner } from './ConnectionBanner';
import { EditorSlate } from './EditorSlate';
import { TextEditorDialog } from './TextEditorDialog';

export function MainBoard() {
    return (
        <main className="relative flex h-full flex-col overflow-hidden bg-card/20">
            <ConnectionBanner />
            <EditorSlate />
            <TextEditorWrapper />
        </main>
    );
}

function TextEditorWrapper() {
    const projectId = useEditorStore((s) => s.projectId);
    const commitId = useEditorStore((s) => s.commitId);
    const activeSlideId = useEditorStore((s) => s.activeSlideId);
    const editingTextLayerId = useEditorStore((s) => s.editingTextLayerId);
    const stopTextEditing = useEditorStore((s) => s.stopTextEditing);

    if (editingTextLayerId === null) return null;
    return (
        <TextEditorDialog
            key={`txt_edit_${projectId}/${commitId}/${activeSlideId}/${editingTextLayerId}`}
            layerId={editingTextLayerId}
            open
            onOpenChange={(open) => {
                if (!open) stopTextEditing();
            }}
        />
    );
}
