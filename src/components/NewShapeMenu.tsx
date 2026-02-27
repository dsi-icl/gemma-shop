import { CircleIcon, RectangleIcon, TextTIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { addRectangleShape } from '@/lib/stageTools';

export function NewShapeMenu() {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="hover:cursor-pointer">
                    Add
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-40" align="start">
                <DropdownMenuGroup>
                    {/* <DropdownMenuLabel>Item</DropdownMenuLabel> */}
                    <DropdownMenuItem
                        className="hover:cursor-pointer"
                        onClick={() => {
                            if (typeof window === 'undefined') return;
                            const el = window.document.getElementById('main-stage-editor-slot');
                            addRectangleShape({
                                width: 100,
                                height: 100,
                                x: el ? el.clientWidth / 2 - 50 + el.scrollLeft : 100,
                                y: el ? el.clientHeight / 2 - 50 + el.scrollTop : 100
                            });
                        }}
                    >
                        <RectangleIcon className="h-4 w-4" />
                        Rectangle
                        {/* <DropdownMenuShortcut>⌘R</DropdownMenuShortcut> */}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="hover:cursor-pointer">
                        <CircleIcon className="h-4 w-4" />
                        Circle
                        {/* <DropdownMenuShortcut>⌘C</DropdownMenuShortcut> */}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="hover:cursor-pointer">
                        <TextTIcon className="h-4 w-4" />
                        Text
                        {/* <DropdownMenuShortcut>⌘T</DropdownMenuShortcut> */}
                    </DropdownMenuItem>
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
