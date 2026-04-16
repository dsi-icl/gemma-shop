import { KeyboardIcon } from '@phosphor-icons/react';
import { Button } from '@repo/ui/components/button';
import { useLocalStorageToggle } from '@repo/ui/hooks/use-localstorage-toggle';
import { cn } from '@repo/ui/lib/utils';
import { useEffect, useRef } from 'react';

import { useIsTouchOnlyDevice, useLastInputType } from '~/lib/inputMode';

const actionLabelClass =
    'hidden xl:inline overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-200 ml-1 max-w-36 opacity-100 last-mouse:ml-0 last-mouse:max-w-0 last-mouse:opacity-0 last-mouse:group-hover/button:ml-1 last-mouse:group-hover/button:max-w-36 last-mouse:group-hover/button:opacity-100';

export function KeyboardToggle() {
    const isTouchOnly = useIsTouchOnlyDevice();
    const lastInputType = useLastInputType();
    const previousInputTypeRef = useRef(lastInputType);

    const [showKeyboard, toggleKeyboard] = useLocalStorageToggle(
        'virtual-keyboard-display',
        isTouchOnly
    );

    useEffect(() => {
        const previousInputType = previousInputTypeRef.current;
        const isMouseToTouch = previousInputType === 'mouse' && lastInputType === 'touch';

        if (isMouseToTouch && !showKeyboard) {
            toggleKeyboard();
        }

        previousInputTypeRef.current = lastInputType;
    }, [lastInputType, showKeyboard, toggleKeyboard]);

    return (
        <div
            className={cn(
                showKeyboard ? 'bg-black text-white dark:bg-white dark:text-black' : '',
                'rounded-4xl transition-all'
            )}
        >
            <Button
                variant={isTouchOnly ? 'outline' : 'ghost'}
                className="px-2 xl:px-3"
                onClick={() => toggleKeyboard()}
            >
                <KeyboardIcon className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all" />
                <span className={actionLabelClass}>Keyboard</span>
                <span className="sr-only">Toggle keyboard</span>
            </Button>
        </div>
    );
}
