import { MoonIcon, SunIcon } from '@phosphor-icons/react';
import { Button } from '@repo/ui/components/button';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger
} from '@repo/ui/components/dropdown-menu';
import { useTheme } from '@repo/ui/lib/theme-provider';

const actionLabelClass =
    'hidden xl:inline overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-200 ml-1 max-w-36 opacity-100 last-mouse:ml-0 last-mouse:max-w-0 last-mouse:opacity-0 last-mouse:group-hover/button:ml-1 last-mouse:group-hover/button:max-w-36 last-mouse:group-hover/button:opacity-100';

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" className="px-2 xl:px-3" />}>
                <span className="relative block h-[1.2rem] w-[1.2rem]">
                    <MoonIcon className="absolute inset-0 h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
                    <SunIcon className="absolute inset-0 h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
                </span>
                <span className={actionLabelClass}>Theme</span>
                <span className="sr-only">Toggle theme</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuCheckboxItem
                    checked={theme === 'light'}
                    onCheckedChange={(v) => v && setTheme('light')}
                >
                    Light
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                    checked={theme === 'dark'}
                    onCheckedChange={(v) => v && setTheme('dark')}
                >
                    Dark
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                    checked={theme === 'system'}
                    onCheckedChange={(v) => v && setTheme('system')}
                >
                    System
                </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
