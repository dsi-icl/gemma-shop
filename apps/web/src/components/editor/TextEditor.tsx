import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';

import ToolbarPlugin from './ToolbarPlugin';

export function TextEditor() {
    return (
        <div className="flex flex-col gap-4">
            <ToolbarPlugin />
            <div className="h-100 w-150 overflow-auto rounded-lg border border-border bg-black">
                <RichTextPlugin
                    contentEditable={
                        <ContentEditable className="editor-input h-full w-full p-4 outline-none" />
                    }
                    ErrorBoundary={LexicalErrorBoundary}
                />
                <AutoFocusPlugin />
            </div>
        </div>
    );
}
