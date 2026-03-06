'use client';

import {
    CheckCircleIcon,
    CircleNotchIcon,
    InfoIcon,
    WarningCircleIcon,
    XCircleIcon
} from '@phosphor-icons/react';
import { useTheme } from '@repo/ui/lib/theme-provider';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = 'system' } = useTheme();

    return (
        <Sonner
            theme={theme}
            className="toaster group"
            icons={{
                success: <CheckCircleIcon className="size-4" />,
                info: <InfoIcon className="size-4" />,
                warning: <WarningCircleIcon className="size-4" />,
                error: <XCircleIcon className="size-4" />,
                loading: <CircleNotchIcon className="size-4 animate-spin" />
            }}
            style={
                {
                    '--normal-bg': 'var(--popover)',
                    '--normal-text': 'var(--popover-foreground)',
                    '--normal-border': 'var(--border)',
                    '--border-radius': 'var(--radius)'
                } as React.CSSProperties
            }
            toastOptions={{
                classNames: {
                    toast: 'cn-toast'
                }
            }}
            {...props}
        />
    );
};

export { Toaster };
