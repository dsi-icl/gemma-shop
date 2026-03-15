import { CircleNotchIcon } from '@phosphor-icons/react';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_auth/quarry/editor/$projectId/')({
    ssr: false,
    component: ProjectEditor
});

function ProjectEditor() {
    return (
        <div className="container mx-auto h-full min-h-full p-4 pt-24">
            <div className="flex h-full items-center justify-center gap-2 align-middle">
                <span>Loading your project</span>
                <CircleNotchIcon className="animate-spin" />
            </div>
        </div>
    );
}
