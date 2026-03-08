import { ResizablePanel } from '@repo/ui/components/resizable';

export function MainBoard() {
    return (
        <ResizablePanel>
            <main className="relative flex h-full flex-col">
                <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/20 p-8">
                    <div className="relative flex h-[450px] w-[800px] flex-col items-center justify-center rounded-lg bg-card shadow-lg ring-1 ring-border"></div>
                </div>
            </main>
        </ResizablePanel>
    );
}
