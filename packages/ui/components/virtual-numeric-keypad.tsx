import { BackspaceIcon } from '@phosphor-icons/react';
import { cn } from '@repo/ui/lib/utils';

import { useLocalStorageToggle } from '../hooks/use-localstorage-toggle';

const KEY_CLASS =
    'flex h-14 items-center justify-center rounded-lg border text-xl font-medium transition-colors hover:bg-accent active:bg-accent/70 disabled:opacity-50';

export function VirtualNumericKeypad({
    onDigit,
    onDelete,
    disabled,
    className
}: {
    onDigit: (digit: string) => void;
    onDelete: () => void;
    disabled?: boolean;
    className?: string;
}) {
    const [showKeyboard] = useLocalStorageToggle('virtual-keyboard-display');

    if (!showKeyboard) return null;
    return (
        <div className={cn('grid w-full max-w-[18rem] grid-cols-3 gap-2', className)}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                    key={d}
                    type="button"
                    disabled={disabled}
                    className={KEY_CLASS}
                    onClick={() => onDigit(d)}
                >
                    {d}
                </button>
            ))}
            <div />
            <button
                type="button"
                disabled={disabled}
                className={KEY_CLASS}
                onClick={() => onDigit('0')}
            >
                0
            </button>
            <button
                type="button"
                disabled={disabled}
                className={KEY_CLASS}
                onClick={onDelete}
                aria-label="Delete"
            >
                <BackspaceIcon className="size-6" />
            </button>
        </div>
    );
}
