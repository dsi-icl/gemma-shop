import {
    ArrowsInIcon,
    ArrowsOutSimpleIcon,
    CastleTurretIcon,
    CircleNotchIcon,
    SignOutIcon,
    UserIcon
} from '@phosphor-icons/react';
import authClient from '@repo/auth/auth-client';
import { useAuthSuspense } from '@repo/auth/tanstack/hooks';
import { authQueryOptions } from '@repo/auth/tanstack/queries';
import { Button } from '@repo/ui/components/button';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import { KeyboardToggle } from './KeyboardToggle';
import { ThemeToggle } from './ThemeToggle';

function FullscreenToggle() {
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
        sync();
        document.addEventListener('fullscreenchange', sync);
        return () => document.removeEventListener('fullscreenchange', sync);
    }, []);

    const toggleFullscreen = useCallback(async () => {
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        if (!document.fullscreenElement) {
            if (root.requestFullscreen) {
                await root.requestFullscreen();
            }
            return;
        }
        if (document.exitFullscreen) {
            await document.exitFullscreen();
        }
    }, []);

    return (
        <Button
            variant="outline"
            size="icon"
            onClick={() => void toggleFullscreen()}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
            {isFullscreen ? (
                <ArrowsInIcon className="h-[1.2rem] w-[1.2rem]" />
            ) : (
                <ArrowsOutSimpleIcon className="h-[1.2rem] w-[1.2rem]" />
            )}
        </Button>
    );
}

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
    const searchStr = useLocation({
        select: (location) => location.searchStr
    });

    const mountLocation = useMemo(() => {
        const params = new URLSearchParams(searchStr);
        return params.get('l');
    }, [searchStr]);

    if (mountLocation === 'gallery' || mountLocation === 'wall') return null;

    return (
        <header className="absolute top-0 left-0 flex w-full items-center justify-end gap-2 p-4">
            <Link to="/" className="flex grow flex-row gap-3 font-mono">
                Gemma Shop
            </Link>
            <KeyboardToggle />
            <FullscreenToggle />
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
