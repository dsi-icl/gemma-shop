import {
    ArrowClockwiseIcon,
    ArrowsInIcon,
    ArrowsOutSimpleIcon,
    BookOpenUserIcon,
    CastleTurretIcon,
    CircleNotchIcon,
    KanbanIcon,
    SignOutIcon,
    UserIcon
} from '@phosphor-icons/react';
import authClient from '@repo/auth/auth-client';
import { useAuthSuspense } from '@repo/auth/tanstack/hooks';
import { authQueryOptions } from '@repo/auth/tanstack/queries';
import { Button } from '@repo/ui/components/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogTitle
} from '@repo/ui/components/dialog';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

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

function RefreshPageButton() {
    const reloadPage = useCallback(() => {
        if (typeof window === 'undefined') return;
        window.location.reload();
    }, []);

    return (
        <Button
            variant="outline"
            size="icon"
            onClick={reloadPage}
            title="Refresh page"
            aria-label="Refresh page"
        >
            <ArrowClockwiseIcon className="h-[1.2rem] w-[1.2rem]" />
        </Button>
    );
}

function HeaderAuthSection() {
    const { user } = useAuthSuspense();
    const queryClient = useQueryClient();
    const router = useRouter();
    const navigate = useNavigate();
    const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
    const [isSigningOut, setIsSigningOut] = useState(false);

    const handleSignOut = async () => {
        setIsSigningOut(true);
        await authClient.signOut({
            fetchOptions: {
                onSuccess: async () => {
                    setSignOutDialogOpen(false);
                    queryClient.setQueryData(authQueryOptions().queryKey, null);
                    await router.invalidate();
                    navigate({ to: '/' });
                },
                onError: async (ctx) => {
                    const err =
                        ctx && typeof ctx === 'object'
                            ? (ctx as Record<string, unknown>).error
                            : null;
                    const errObj =
                        err && typeof err === 'object' ? (err as Record<string, unknown>) : null;
                    const message =
                        (typeof errObj?.message === 'string' ? errObj.message : null) ||
                        (typeof errObj?.statusText === 'string' ? errObj.statusText : null) ||
                        'Sign out failed';
                    toast.error(message);
                    queryClient.setQueryData(authQueryOptions().queryKey, null);
                    await router.invalidate();
                    setIsSigningOut(false);
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
            <Link to="/gallery">
                <Button variant="outline">
                    <KanbanIcon className="h-[1.2rem] w-[1.2rem]" />
                </Button>
            </Link>
            <Link to="/quarry">
                <Button variant="outline">
                    <BookOpenUserIcon className="h-[1.2rem] w-[1.2rem]" />
                </Button>
            </Link>
            {user.role === 'admin' && (
                <Link to="/admin">
                    <Button variant="outline" size="icon" title="Administration">
                        <CastleTurretIcon className="h-[1.2rem] w-[1.2rem]" />
                    </Button>
                </Link>
            )}
            <Button variant="outline" onClick={() => setSignOutDialogOpen(true)}>
                <SignOutIcon className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all" />
                <span className="hidden lg:inline">{user.email}</span>
            </Button>
            <Dialog open={signOutDialogOpen} onOpenChange={setSignOutDialogOpen}>
                <DialogContent className="w-80 p-5">
                    <DialogTitle>Log out</DialogTitle>
                    <DialogDescription className="mt-1">
                        Are you sure you want to log out of this account?
                    </DialogDescription>
                    <div className="mt-4 flex justify-end gap-2">
                        <DialogClose>
                            <Button variant="outline" size="sm" disabled={isSigningOut}>
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleSignOut}
                            disabled={isSigningOut}
                        >
                            {isSigningOut ? 'Logging out...' : 'Log out'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
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
            <Link to="/" className="flex flex-row gap-3 font-mono">
                Gemma Shop
            </Link>
            <span className="grow" />
            <KeyboardToggle />
            <RefreshPageButton />
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
