import { ConnectionBanner } from './ConnectionBanner';
import { EditorSlate } from './EditorSlate';

export function MainBoard() {
    return (
        <main className="relative flex h-full flex-col overflow-hidden bg-card/20">
            <ConnectionBanner />
            <EditorSlate />
        </main>
    );
}
