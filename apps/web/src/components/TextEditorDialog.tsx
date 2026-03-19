'use client';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@repo/ui/components/dialog';

import { CollaborativeEditor } from './editor/CollaborativeEditor';

interface TextEditorDialogProps {
    layerId: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function TextEditorDialog({ layerId, open, onOpenChange }: TextEditorDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[95vh] max-w-fit flex-col gap-3 overflow-hidden p-4">
                <DialogTitle className="text-sm font-medium">Edit Text Layer</DialogTitle>
                <DialogDescription className="sr-only">Text Edit</DialogDescription>
                {open && <CollaborativeEditor layerId={layerId} />}
            </DialogContent>
        </Dialog>
    );
}
