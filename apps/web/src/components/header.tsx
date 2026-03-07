import { CircleNotchIcon, SignOutIcon, UserIcon } from '@phosphor-icons/react';
import { useAuthSuspense } from '@repo/auth/tanstack/hooks';
import { Button } from '@repo/ui/components/button';
import { Clock } from '@repo/ui/components/clock';
import { Link } from '@tanstack/react-router';
import { Suspense } from 'react';

import { KeyboardToggle } from './keyboard-toggle';
import { ThemeToggle } from './theme-toggle';

export function Header() {
    const { user } = useAuthSuspense();
    return (
        <header className="absolute top-0 left-0 flex min-w-screen items-center justify-end gap-2 p-4">
            <div className="grow">
                <Clock />
            </div>
            <KeyboardToggle />
            <ThemeToggle />
            <Link to="/login">
                <Button variant="outline" size="icon">
                    <Suspense
                        fallback={
                            <CircleNotchIcon className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 animate-spin transition-all" />
                        }
                    >
                        {user ? (
                            <SignOutIcon className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all" />
                        ) : (
                            <UserIcon className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all" />
                        )}
                    </Suspense>
                </Button>
            </Link>
        </header>
    );
}
