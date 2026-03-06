import { Clock } from '@repo/ui/components/clock';

import { KeyboardToggle } from './keyboard-toggle';
import { ThemeToggle } from './theme-toggle';

export function Header() {
    return (
        <header className="flex items-center justify-end gap-2 p-4">
            <div className="grow">
                <Clock />
            </div>
            <KeyboardToggle />
            <ThemeToggle />
        </header>
    );
}
