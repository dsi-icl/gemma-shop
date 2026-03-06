import { BackspaceIcon } from '@phosphor-icons/react';
import { cn } from '@repo/ui/lib/utils';
import { AnimatePresence, motion } from 'motion/react';

import { useLocalStorageToggle } from '../hooks/use-localstorage-toggle';

const KEY_CLASS =
    'flex h-11 items-center justify-center rounded-lg border text-sm font-medium transition-colors hover:bg-accent active:bg-accent/70 disabled:opacity-50';

const ROW_1 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
const ROW_2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
const ROW_3 = ['z', 'x', 'c', 'v', 'b', 'n', 'm'];
const DOMAINS = ['.com', 'imperial.ac.uk'];

export function VirtualEmailKeyboard({
    onKey,
    onDelete,
    disabled,
    className
}: {
    onKey: (key: string) => void;
    onDelete: () => void;
    disabled?: boolean;
    className?: string;
}) {
    const [showKeyboard] = useLocalStorageToggle('virtual-keyboard-display');

    return (
        <AnimatePresence>
            {showKeyboard && (
                <motion.div
                    initial={{ y: -10, opacity: 0, filter: 'blur(4px)' }}
                    animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                    exit={{ y: -10, opacity: 0, filter: 'blur(4px)' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className={cn('flex w-full max-w-md flex-col gap-1.5', className)}
                >
                    {/* Row 1: numbers */}
                    <div className="flex gap-1">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((k) => (
                            <button
                                key={k}
                                type="button"
                                disabled={disabled}
                                className={cn(KEY_CLASS, 'flex-1')}
                                onClick={() => onKey(k)}
                            >
                                {k}
                            </button>
                        ))}
                    </div>

                    {/* Row 2: qwerty top */}
                    <div className="flex gap-1">
                        {ROW_1.map((k) => (
                            <button
                                key={k}
                                type="button"
                                disabled={disabled}
                                className={cn(KEY_CLASS, 'flex-1')}
                                onClick={() => onKey(k)}
                            >
                                {k}
                            </button>
                        ))}
                    </div>

                    {/* Row 3: home row */}
                    <div className="flex gap-1 px-[5%]">
                        {ROW_2.map((k) => (
                            <button
                                key={k}
                                type="button"
                                disabled={disabled}
                                className={cn(KEY_CLASS, 'flex-1')}
                                onClick={() => onKey(k)}
                            >
                                {k}
                            </button>
                        ))}
                    </div>

                    {/* Row 4: bottom row + backspace */}
                    <div className="flex gap-1 px-[10%]">
                        {ROW_3.map((k) => (
                            <button
                                key={k}
                                type="button"
                                disabled={disabled}
                                className={cn(KEY_CLASS, 'flex-1')}
                                onClick={() => onKey(k)}
                            >
                                {k}
                            </button>
                        ))}
                        <button
                            type="button"
                            disabled={disabled}
                            className={cn(KEY_CLASS, 'flex-[1.5]')}
                            onClick={onDelete}
                            aria-label="Delete"
                        >
                            <BackspaceIcon className="size-5" />
                        </button>
                    </div>

                    {/* Row 5: special email keys */}
                    <div className="flex gap-1">
                        <button
                            type="button"
                            disabled={disabled}
                            className={cn(KEY_CLASS, 'flex-[1.5]')}
                            onClick={() => onKey('@')}
                        >
                            @
                        </button>
                        <button
                            type="button"
                            disabled={disabled}
                            className={cn(KEY_CLASS, 'flex-[1.5]')}
                            onClick={() => onKey('-')}
                        >
                            -
                        </button>
                        <button
                            type="button"
                            disabled={disabled}
                            className={cn(KEY_CLASS, 'flex-[1.5]')}
                            onClick={() => onKey('_')}
                        >
                            _
                        </button>
                        <button
                            type="button"
                            disabled={disabled}
                            className={cn(KEY_CLASS, 'flex-[1.5]')}
                            onClick={() => onKey('.')}
                        >
                            .
                        </button>
                        {DOMAINS.map((d) => (
                            <button
                                key={d}
                                type="button"
                                disabled={disabled}
                                className={cn(
                                    KEY_CLASS,
                                    d.length > 5 ? 'flex-4' : 'flex-2',
                                    'text-xs'
                                )}
                                onClick={() => onKey(d)}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
