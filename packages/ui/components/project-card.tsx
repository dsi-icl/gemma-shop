import { ArrowRightIcon, EyeIcon } from '@phosphor-icons/react';

import { Badge } from './badge';
import { Button } from './button';
import {
    MorphingDialog,
    MorphingDialogClose,
    MorphingDialogContainer,
    MorphingDialogContent,
    MorphingDialogDescription,
    MorphingDialogImage,
    MorphingDialogStateControls,
    MorphingDialogSubtitle,
    MorphingDialogTitle,
    MorphingDialogTrigger
} from './morphing-dialog';

export interface Project {
    name: string;
    author: string;
    description: string;
    tags: string[];
    imageUrl?: string;
}

interface ProjectCardProps {
    project: Project;
    onLoadProject?: () => void;
}

export function ProjectCard({ project, onLoadProject }: ProjectCardProps) {
    return (
        <MorphingDialog
            transition={{
                type: 'spring',
                bounce: 0.05,
                duration: 0.25
            }}
        >
            <MorphingDialogTrigger
                style={{
                    borderRadius: '12px'
                }}
                className="flex max-w-67.5 flex-col overflow-hidden border border-zinc-950/10 bg-white dark:border-zinc-50/10 dark:bg-zinc-900"
            >
                <MorphingDialogImage
                    src={project.imageUrl}
                    alt={project.name}
                    state={'closed'}
                    className="h-48 w-full object-cover"
                />
                <div className="flex grow flex-col justify-between p-3">
                    <div>
                        <div className="flex items-start justify-between">
                            <div className="text-left">
                                <MorphingDialogTitle className="text-zinc-950 dark:text-zinc-50">
                                    {project.name}
                                </MorphingDialogTitle>
                                <MorphingDialogSubtitle className="text-zinc-700 dark:text-zinc-400">
                                    {project.author}
                                </MorphingDialogSubtitle>
                            </div>
                            <button
                                type="button"
                                className="relative ml-1 flex h-6 w-6 shrink-0 scale-100 appearance-none items-center justify-center rounded-lg border border-zinc-950/10 text-zinc-500 transition-colors select-none hover:bg-zinc-100 hover:text-zinc-800 focus-visible:ring-2 active:scale-[0.98] dark:border-zinc-50/10 dark:bg-zinc-900 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 dark:focus-visible:ring-zinc-500"
                                aria-label="Open dialog"
                            >
                                <EyeIcon size={12} />
                            </button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                            {project.tags.slice(0, 3).map((tag) => (
                                <Badge key={tag} variant="secondary" className="text-xs">
                                    {tag}
                                </Badge>
                            ))}
                        </div>
                    </div>
                </div>
            </MorphingDialogTrigger>
            <MorphingDialogContainer>
                <MorphingDialogContent
                    style={{
                        borderRadius: '24px'
                    }}
                    className="pointer-events-auto relative flex h-auto w-full flex-col overflow-hidden border border-zinc-950/10 bg-white sm:w-[500px] dark:border-zinc-50/10 dark:bg-zinc-900"
                >
                    <MorphingDialogStateControls />
                    <MorphingDialogImage
                        src={project.imageUrl}
                        alt={project.name}
                        state={'opened'}
                        className="h-full w-full"
                    />
                    <div className="p-6">
                        <MorphingDialogTitle className="text-2xl text-zinc-950 dark:text-zinc-50">
                            {project.name}
                        </MorphingDialogTitle>
                        <MorphingDialogSubtitle className="text-zinc-700 dark:text-zinc-400">
                            {project.author}
                        </MorphingDialogSubtitle>

                        <div className="mt-4 flex flex-wrap gap-2">
                            {project.tags.map((tag) => (
                                <Badge key={tag} variant="outline">
                                    {tag}
                                </Badge>
                            ))}
                        </div>

                        <MorphingDialogDescription
                            disableLayoutAnimation
                            variants={{
                                initial: { opacity: 0, scale: 0.8, y: 100 },
                                animate: { opacity: 1, scale: 1, y: 0 },
                                exit: { opacity: 0, scale: 0.8, y: 100 }
                            }}
                        >
                            <p className="mt-2 text-zinc-500 dark:text-zinc-500">
                                {project.description}
                            </p>

                            <Button className="mt-5 w-full" onClick={onLoadProject}>
                                Load project <ArrowRightIcon />
                            </Button>
                        </MorphingDialogDescription>
                    </div>
                    <MorphingDialogClose className="text-zinc-50" />
                </MorphingDialogContent>
            </MorphingDialogContainer>
        </MorphingDialog>
    );
}
