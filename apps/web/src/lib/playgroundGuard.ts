import { redirect } from '@tanstack/react-router';

export function guardPlaygroundDevOnly(): void {
    if (import.meta.env.DEV) return;
    throw redirect({ to: '/' });
}
