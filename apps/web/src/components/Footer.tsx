import { Clock } from '@repo/ui/components/clock';

export function Footer() {
    return (
        <footer className="absolute bottom-0 left-0 flex w-full items-center justify-between gap-2 p-4 text-sm text-accent">
            <span className="grow">© 2026 Data Science Imperial. All rights reserved.</span>
            <Clock />
        </footer>
    );
}
