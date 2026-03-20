import { CastleTurretIcon, CircleNotchIcon, SignOutIcon, UserIcon } from '@phosphor-icons/react';
import authClient from '@repo/auth/auth-client';
import { useAuthSuspense } from '@repo/auth/tanstack/hooks';
import { authQueryOptions } from '@repo/auth/tanstack/queries';
import { Button } from '@repo/ui/components/button';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { Suspense } from 'react';

import { KeyboardToggle } from './KeyboardToggle';
import { ThemeToggle } from './ThemeToggle';

function HeaderAuthSection() {
    const { user } = useAuthSuspense();
    const queryClient = useQueryClient();
    const router = useRouter();
    const navigate = useNavigate();

    const handleSignOut = async () => {
        await authClient.signOut({
            fetchOptions: {
                onSuccess: async () => {
                    queryClient.setQueryData(authQueryOptions().queryKey, null);
                    await router.invalidate();
                    navigate({ to: '/' });
                }
            }
        });
    };

    if (!user) {
        return (
            <Link to="/login">
                <Button variant="outline">
                    <UserIcon className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all" />
                </Button>
            </Link>
        );
    }

    return (
        <>
            {(user as any).role === 'admin' && (
                <Link to="/admin">
                    <Button variant="outline" size="icon" title="Administration">
                        <CastleTurretIcon className="h-[1.2rem] w-[1.2rem]" />
                    </Button>
                </Link>
            )}
            <Button variant="outline" onClick={handleSignOut}>
                <SignOutIcon className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all" />
                <span className="hidden lg:inline">{user.email}</span>
            </Button>
        </>
    );
}

export function Header() {
    return (
        <header className="absolute top-0 left-0 flex min-w-screen items-center justify-end gap-2 p-4">
            <Link to="/" className="flex grow flex-row gap-3 font-mono">
                Gemma Shop
            </Link>
            <KeyboardToggle />
            <ThemeToggle />
            <Suspense
                fallback={
                    <CircleNotchIcon className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 animate-spin transition-all" />
                }
            >
                <HeaderAuthSection />
            </Suspense>
        </header>
    );
}
