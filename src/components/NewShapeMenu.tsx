import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    // DropdownMenuPortal,
    // DropdownMenuSeparator,
    // DropdownMenuShortcut,
    // DropdownMenuSub,
    // DropdownMenuSubContent,
    // DropdownMenuSubTrigger,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

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
                    <DropdownMenuLabel>Item</DropdownMenuLabel>
                    <DropdownMenuItem className="hover:cursor-pointer">
                        Rectange
                        {/* <DropdownMenuShortcut>⌘R</DropdownMenuShortcut> */}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="hover:cursor-pointer">
                        Circle
                        {/* <DropdownMenuShortcut>⌘C</DropdownMenuShortcut> */}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="hover:cursor-pointer">
                        Text
                        {/* <DropdownMenuShortcut>⌘T</DropdownMenuShortcut> */}
                    </DropdownMenuItem>
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
