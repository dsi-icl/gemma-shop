'use client';

import { ArrowsInIcon, ArrowsOutSimpleIcon, XIcon } from '@phosphor-icons/react';
import useClickOutside from '@repo/ui/hooks/use-click-outside';
import { cn } from '@repo/ui/lib/utils';
import { motion, AnimatePresence, MotionConfig, Transition, Variant } from 'motion/react';
import React, { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import AnimatedBlurPattern from './blur-pattern';

export type MorphingDialogState = 'closed' | 'expanded' | 'fullscreen' | 'minimized';

export type MorphingDialogContextType = {
    state: MorphingDialogState;
    setState: React.Dispatch<React.SetStateAction<MorphingDialogState>>;
    isOpen: boolean;
    setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
    expand: () => void;
    fullscreen: () => void;
    minimize: () => void;
    close: () => void;
    consumeTriggerCloseGuard: () => boolean;
    uniqueId: string;
    triggerRef: React.RefObject<HTMLButtonElement | null>;
};

const MorphingDialogContext = React.createContext<MorphingDialogContextType | null>(null);
const dialogStateRegistry = new Map<string, MorphingDialogState>();

function hasCompetingOpenDialog(currentId: string): boolean {
    for (const [id, state] of dialogStateRegistry) {
        if (id === currentId) continue;
        if (state === 'expanded' || state === 'fullscreen' || state === 'minimized') {
            return true;
        }
    }
    return false;
}

function useMorphingDialog() {
    const context = useContext(MorphingDialogContext);
    if (!context) {
        throw new Error('useMorphingDialog must be used within a MorphingDialogProvider');
    }
    return context;
}

export type MorphingDialogProviderProps = {
    children: React.ReactNode;
    transition?: Transition;
    defaultState?: MorphingDialogState;
    onStateChange?: (state: MorphingDialogState) => void;
    forceOpenSignal?: string | number | null;
    forceDemoteFullscreenSignal?: string | number | null;
    forceCloseSignal?: string | number | null;
};

function MorphingDialogProvider({
    children,
    transition,
    defaultState = 'closed',
    onStateChange,
    forceOpenSignal,
    forceDemoteFullscreenSignal,
    forceCloseSignal
}: MorphingDialogProviderProps) {
    const [state, setState] = useState<MorphingDialogState>(defaultState);
    const lastForceOpenSignalRef = useRef<string | number | null | undefined>(undefined);
    const lastForceDemoteSignalRef = useRef<string | number | null | undefined>(undefined);
    const lastForceCloseSignalRef = useRef<string | number | null | undefined>(undefined);
    const closeRafRef = useRef<number | null>(null);
    const closeLockRef = useRef(false);
    const triggerCloseGuardRef = useRef(false);
    const triggerCloseGuardRafRef = useRef<number | null>(null);
    const uniqueId = useId();
    const triggerRef = useRef<HTMLButtonElement>(null!);
    const isOpen = state !== 'closed';
    const setIsOpen = useCallback((next: React.SetStateAction<boolean>) => {
        setState((prev) => {
            const resolved = typeof next === 'function' ? next(prev !== 'closed') : next;
            if (resolved) {
                return prev === 'closed' ? 'expanded' : prev;
            }
            return 'closed';
        });
    }, []);
    const expand = useCallback(() => setState('expanded'), []);
    const fullscreen = useCallback(() => setState('fullscreen'), []);
    const minimize = useCallback(() => setState('minimized'), []);
    const close = useCallback(() => {
        if (closeLockRef.current) return;
        closeLockRef.current = true;
        triggerCloseGuardRef.current = true;
        if (triggerCloseGuardRafRef.current) {
            cancelAnimationFrame(triggerCloseGuardRafRef.current);
        }
        triggerCloseGuardRafRef.current = requestAnimationFrame(() => {
            triggerCloseGuardRef.current = false;
            triggerCloseGuardRafRef.current = null;
        });

        setState((prev) => {
            if (prev === 'fullscreen' || prev === 'minimized') {
                if (closeRafRef.current) cancelAnimationFrame(closeRafRef.current);
                closeRafRef.current = requestAnimationFrame(() => {
                    setState('closed');
                    closeRafRef.current = null;
                    closeLockRef.current = false;
                });
                return 'expanded';
            }

            requestAnimationFrame(() => {
                closeLockRef.current = false;
            });
            return 'closed';
        });
    }, []);

    const consumeTriggerCloseGuard = useCallback(() => {
        if (!triggerCloseGuardRef.current) return false;
        triggerCloseGuardRef.current = false;
        return true;
    }, []);

    useEffect(() => {
        return () => {
            if (closeRafRef.current) {
                cancelAnimationFrame(closeRafRef.current);
                closeRafRef.current = null;
            }
            if (triggerCloseGuardRafRef.current) {
                cancelAnimationFrame(triggerCloseGuardRafRef.current);
                triggerCloseGuardRafRef.current = null;
            }
            closeLockRef.current = false;
            triggerCloseGuardRef.current = false;
        };
    }, []);

    const contextValue = useMemo(
        () => ({
            state,
            setState,
            isOpen,
            setIsOpen,
            expand,
            fullscreen,
            minimize,
            close,
            consumeTriggerCloseGuard,
            uniqueId,
            triggerRef
        }),
        [
            state,
            isOpen,
            setIsOpen,
            expand,
            fullscreen,
            minimize,
            close,
            consumeTriggerCloseGuard,
            uniqueId
        ]
    );

    useEffect(() => {
        onStateChange?.(state);
    }, [state, onStateChange]);

    useEffect(() => {
        dialogStateRegistry.set(uniqueId, state);
        return () => {
            dialogStateRegistry.delete(uniqueId);
        };
    }, [uniqueId, state]);

    useEffect(() => {
        if (forceOpenSignal === null || forceOpenSignal === undefined) {
            lastForceOpenSignalRef.current = forceOpenSignal;
            return;
        }
        if (Object.is(lastForceOpenSignalRef.current, forceOpenSignal)) return;
        lastForceOpenSignalRef.current = forceOpenSignal;
        // Remote-triggered open:
        // - if this dialog is already open but not fullscreen, promote it to fullscreen
        // - if another dialog is already open, open this one minimized to avoid stealing focus
        // - otherwise open fullscreen as before
        setState((prev) => {
            if (prev === 'expanded' || prev === 'minimized') return 'fullscreen';
            if (prev === 'fullscreen') return prev;
            return hasCompetingOpenDialog(uniqueId) ? 'minimized' : 'fullscreen';
        });
    }, [forceOpenSignal, uniqueId]);

    useEffect(() => {
        if (forceDemoteFullscreenSignal === null || forceDemoteFullscreenSignal === undefined) {
            lastForceDemoteSignalRef.current = forceDemoteFullscreenSignal;
            return;
        }
        if (Object.is(lastForceDemoteSignalRef.current, forceDemoteFullscreenSignal)) return;
        lastForceDemoteSignalRef.current = forceDemoteFullscreenSignal;
        setState((prev) => (prev === 'fullscreen' ? 'expanded' : prev));
    }, [forceDemoteFullscreenSignal]);

    useEffect(() => {
        if (forceCloseSignal === null || forceCloseSignal === undefined) {
            lastForceCloseSignalRef.current = forceCloseSignal;
            return;
        }
        if (Object.is(lastForceCloseSignalRef.current, forceCloseSignal)) return;
        lastForceCloseSignalRef.current = forceCloseSignal;
        if (state !== 'fullscreen' && state !== 'minimized') return;
        close();
    }, [forceCloseSignal, state, close]);

    return (
        <MorphingDialogContext.Provider value={contextValue}>
            <MotionConfig transition={transition}>{children}</MotionConfig>
        </MorphingDialogContext.Provider>
    );
}

export type MorphingDialogProps = {
    children: React.ReactNode;
    transition?: Transition;
    defaultState?: MorphingDialogState;
    onStateChange?: (state: MorphingDialogState) => void;
    forceOpenSignal?: string | number | null;
    forceDemoteFullscreenSignal?: string | number | null;
    forceCloseSignal?: string | number | null;
};

function MorphingDialog({
    children,
    transition,
    defaultState,
    onStateChange,
    forceOpenSignal,
    forceDemoteFullscreenSignal,
    forceCloseSignal
}: MorphingDialogProps) {
    return (
        <MorphingDialogProvider
            defaultState={defaultState}
            onStateChange={onStateChange}
            forceOpenSignal={forceOpenSignal}
            forceDemoteFullscreenSignal={forceDemoteFullscreenSignal}
            forceCloseSignal={forceCloseSignal}
        >
            <MotionConfig transition={transition}>{children}</MotionConfig>
        </MorphingDialogProvider>
    );
}

export type MorphingDialogTriggerProps = {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    triggerRef?: React.RefObject<HTMLButtonElement>;
};

function MorphingDialogTrigger({
    children,
    className,
    style,
    triggerRef
}: MorphingDialogTriggerProps) {
    const { state, setState, uniqueId, consumeTriggerCloseGuard } = useMorphingDialog();
    const isOpen = state !== 'closed';

    const handleClick = useCallback(() => {
        if (consumeTriggerCloseGuard()) {
            return;
        }
        setState((prev) => (prev === 'closed' ? 'expanded' : 'closed'));
    }, [consumeTriggerCloseGuard, setState]);

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setState((prev) => (prev === 'closed' ? 'expanded' : 'closed'));
            }
        },
        [setState]
    );

    return (
        <motion.button
            ref={triggerRef}
            layoutId={`dialog-${uniqueId}`}
            className={cn('relative cursor-pointer', className)}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            style={style}
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            aria-controls={`motion-ui-morphing-dialog-content-${uniqueId}`}
            aria-label={`Open dialog ${uniqueId}`}
        >
            {children}
        </motion.button>
    );
}

export type MorphingDialogContentProps = {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
};

function MorphingDialogContent({ children, className, style }: MorphingDialogContentProps) {
    const { state, close, fullscreen, isOpen, uniqueId, triggerRef } = useMorphingDialog();
    const containerRef = useRef<HTMLDivElement>(null!);
    const [firstFocusableElement, setFirstFocusableElement] = useState<HTMLElement | null>(null);
    const [lastFocusableElement, setLastFocusableElement] = useState<HTMLElement | null>(null);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                close();
            }
            if (event.key === 'Tab') {
                if (!firstFocusableElement || !lastFocusableElement) return;

                if (event.shiftKey) {
                    if (document.activeElement === firstFocusableElement) {
                        event.preventDefault();
                        lastFocusableElement.focus();
                    }
                } else {
                    if (document.activeElement === lastFocusableElement) {
                        event.preventDefault();
                        firstFocusableElement.focus();
                    }
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [close, firstFocusableElement, lastFocusableElement]);

    useEffect(() => {
        if (isOpen && state !== 'minimized') {
            document.body.classList.add('overflow-hidden');
            const focusableElements = containerRef.current?.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (focusableElements && focusableElements.length > 0) {
                setFirstFocusableElement(focusableElements[0] as HTMLElement);
                setLastFocusableElement(
                    focusableElements[focusableElements.length - 1] as HTMLElement
                );
                (focusableElements[0] as HTMLElement).focus();
            }
        } else {
            document.body.classList.remove('overflow-hidden');
            if (!isOpen) triggerRef.current?.focus();
        }
    }, [isOpen, state, triggerRef]);

    useClickOutside(containerRef, () => {
        if (typeof document !== 'undefined') {
            if (document.body.getAttribute('data-takeover-lock') === '1') return;
        }
        if (isOpen && state !== 'minimized') close();
    });

    const stateClassName =
        state === 'fullscreen'
            ? '!fixed !inset-4 !z-50 !w-[calc(100vw-2rem)] !h-[calc(100vh-2rem)] !max-w-none !rounded-2xl'
            : state === 'minimized'
              ? '!fixed !left-4 !bottom-4 !z-50 !h-14 !w-14 !max-w-14 !rounded-full shadow-lg'
              : '';

    return (
        <motion.div
            ref={containerRef}
            layout
            layoutId={state === 'minimized' ? undefined : `dialog-${uniqueId}`}
            className={cn('overflow-hidden', className, stateClassName)}
            style={style}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`motion-ui-morphing-dialog-title-${uniqueId}`}
            aria-describedby={`motion-ui-morphing-dialog-description-${uniqueId}`}
            onClick={() => {
                if (state === 'minimized') fullscreen();
            }}
        >
            <div
                className={cn(
                    'h-full w-full',
                    state === 'minimized' && 'pointer-events-none opacity-0'
                )}
            >
                {children}
            </div>
            {state === 'minimized' ? (
                <button
                    type="button"
                    aria-label="Restore fullscreen dialog"
                    className="absolute inset-0 z-10 flex h-full w-full items-center justify-center bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    onClick={(e) => {
                        e.stopPropagation();
                        fullscreen();
                    }}
                >
                    <ArrowsOutSimpleIcon size={16} />
                </button>
            ) : null}
        </motion.div>
    );
}

export type MorphingDialogContainerProps = {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
};

function MorphingDialogContainer({ children }: MorphingDialogContainerProps) {
    const { isOpen, state, uniqueId } = useMorphingDialog();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence initial={false} mode="sync">
            {isOpen && (
                <>
                    <motion.div
                        key={`backdrop-${uniqueId}`}
                        className={cn(
                            'fixed inset-0 h-full w-full bg-black/65 backdrop-blur-sm',
                            state === 'minimized' && 'pointer-events-none opacity-0'
                        )}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: state === 'minimized' ? 0 : 1 }}
                        exit={{ opacity: 0 }}
                    />
                    <div
                        className={cn(
                            'fixed inset-0 z-50',
                            state === 'expanded' && 'flex items-center justify-center',
                            state === 'minimized' && 'pointer-events-none'
                        )}
                    >
                        <div className={cn(state === 'minimized' && 'pointer-events-auto')}>
                            {children}
                        </div>
                    </div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}

export type MorphingDialogTitleProps = {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
};

function MorphingDialogTitle({ children, className, style }: MorphingDialogTitleProps) {
    const { uniqueId } = useMorphingDialog();

    return (
        <motion.div
            layoutId={`dialog-title-container-${uniqueId}`}
            className={className}
            style={style}
            layout
        >
            {children}
        </motion.div>
    );
}

export type MorphingDialogSubtitleProps = {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
};

function MorphingDialogSubtitle({ children, className, style }: MorphingDialogSubtitleProps) {
    const { uniqueId } = useMorphingDialog();

    return (
        <motion.div
            layoutId={`dialog-subtitle-container-${uniqueId}`}
            className={className}
            style={style}
        >
            {children}
        </motion.div>
    );
}

export type MorphingDialogDescriptionProps = {
    children: React.ReactNode;
    className?: string;
    disableLayoutAnimation?: boolean;
    variants?: {
        initial: Variant;
        animate: Variant;
        exit: Variant;
    };
};

function MorphingDialogDescription({
    children,
    className,
    variants,
    disableLayoutAnimation
}: MorphingDialogDescriptionProps) {
    const { uniqueId } = useMorphingDialog();

    return (
        <motion.div
            key={`dialog-description-${uniqueId}`}
            layoutId={disableLayoutAnimation ? undefined : `dialog-description-content-${uniqueId}`}
            variants={variants}
            className={className}
            initial="initial"
            animate="animate"
            exit="exit"
            id={`dialog-description-${uniqueId}`}
        >
            {children}
        </motion.div>
    );
}

export type MorphingDialogImageProps = {
    src?: string;
    alt: string;
    className?: string;
    state?: 'opened' | 'closed';
    style?: React.CSSProperties;
};

function MorphingDialogImage({
    src,
    alt,
    className,
    style,
    state = 'opened'
}: MorphingDialogImageProps) {
    const { uniqueId } = useMorphingDialog();

    if (!src)
        return (
            <AnimatedBlurPattern key={src} seed={alt} height={200} animate={state === 'closed'} />
        );
    return (
        <motion.img
            src={`/api/assets/${src}`}
            alt={alt}
            className={cn(className)}
            layoutId={`dialog-img-${uniqueId}`}
            style={style}
        />
    );
}

export type MorphingDialogCloseProps = {
    className?: string;
    variants?: {
        initial: Variant;
        animate: Variant;
        exit: Variant;
    };
};

function MorphingDialogClose({ className, variants }: MorphingDialogCloseProps) {
    const { close, uniqueId } = useMorphingDialog();

    const handleClose = useCallback(() => {
        close();
    }, [close]);

    return (
        <motion.button
            onClick={handleClose}
            type="button"
            aria-label="Close dialog"
            key={`dialog-close-${uniqueId}`}
            className={cn('absolute top-6 right-6', className)}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={variants}
        >
            <XIcon size={24} />
        </motion.button>
    );
}

function MorphingDialogMinimize({ className, variants }: MorphingDialogCloseProps) {
    const { state, minimize } = useMorphingDialog();
    if (state !== 'fullscreen') return null;

    return (
        <motion.button
            onClick={minimize}
            type="button"
            aria-label="Minimize dialog"
            className={cn('absolute top-6 right-16 z-10', className)}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={variants}
        >
            <ArrowsInIcon size={24} />
        </motion.button>
    );
}

export {
    useMorphingDialog,
    MorphingDialog,
    MorphingDialogTrigger,
    MorphingDialogContainer,
    MorphingDialogContent,
    MorphingDialogClose,
    MorphingDialogTitle,
    MorphingDialogSubtitle,
    MorphingDialogDescription,
    MorphingDialogImage,
    MorphingDialogMinimize
};
