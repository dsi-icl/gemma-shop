import { KeyboardIcon } from '@phosphor-icons/react';
import { Button } from '@repo/ui/components/button';
import { useIsTablet } from '@repo/ui/hooks/use-is-tablet';
import { useLocalStorageToggle } from '@repo/ui/hooks/use-localstorage-toggle';
import { cn } from '@repo/ui/lib/utils';

export function KeyboardToggle() {
    const isTablet = useIsTablet();
    const [showKeyboard, toggleKeyboard] = useLocalStorageToggle(
        'virtual-keyboard-display',
        isTablet
    );

    return (
        <div
            className={cn(
                showKeyboard ? 'bg-black text-white dark:bg-white dark:text-black' : '',
                'rounded-4xl transition-all'
            )}
        >
            <Button
                variant={isTablet ? 'outline' : 'ghost'}
                size="icon"
                onClick={() => toggleKeyboard()}
            >
                <KeyboardIcon className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all" />
                <span className="sr-only">Toggle keyboard</span>
            </Button>
        </div>
    );
}
