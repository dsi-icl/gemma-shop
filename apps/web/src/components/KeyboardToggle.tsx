import { KeyboardIcon } from '@phosphor-icons/react';
import { Button } from '@repo/ui/components/button';
import { useLocalStorageToggle } from '@repo/ui/hooks/use-localstorage-toggle';
import { cn } from '@repo/ui/lib/utils';

import { useIsTouchOnlyDevice } from '~/lib/inputMode';

export function KeyboardToggle() {
    const isTouchOnly = useIsTouchOnlyDevice();

    const [showKeyboard, toggleKeyboard] = useLocalStorageToggle(
        'virtual-keyboard-display',
        isTouchOnly
    );

    return (
        <div
            className={cn(
                showKeyboard ? 'bg-black text-white dark:bg-white dark:text-black' : '',
                'rounded-4xl transition-all'
            )}
        >
            <Button
                variant={isTouchOnly ? 'outline' : 'ghost'}
                size="icon"
                onClick={() => toggleKeyboard()}
            >
                <KeyboardIcon className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all" />
                <span className="sr-only">Toggle keyboard</span>
            </Button>
        </div>
    );
}
