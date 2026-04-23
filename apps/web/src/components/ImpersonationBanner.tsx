import { CircleNotchIcon } from '@phosphor-icons/react';
import { authSessionQueryOptions } from '@repo/auth/tanstack/queries';
import { Button } from '@repo/ui/components/button';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';

import { $adminStopImpersonation } from '~/server/admin.fns';

function getImpersonatedBy(session: unknown): string | null {
    if (!session || typeof session !== 'object') return null;
    const impersonatedBy = (session as { impersonatedBy?: unknown }).impersonatedBy;
    return typeof impersonatedBy === 'string' && impersonatedBy.length > 0 ? impersonatedBy : null;
}

export function ImpersonationBanner() {
    const pathname = useRouterState({
        select: (state) => state.location.pathname
    });
    const isWall = pathname.startsWith('/wall');
    const queryClient = useQueryClient();
    const router = useRouter();
    const navigate = useNavigate();
    const [ending, setEnding] = useState(false);
    const { data } = useQuery(authSessionQueryOptions());
    const user = data?.user ?? null;
    const impersonatedBy = getImpersonatedBy(data?.session);
    const isImpersonating = Boolean(user && impersonatedBy);

    if (isWall || !isImpersonating || !user) return null;

    return (
        <div className="fixed top-0 left-0 z-[120] w-full border-b border-red-900 bg-red-600 px-4 py-2 text-white shadow-lg">
            <div className="flex w-full items-center gap-3 text-sm">
                <div className="truncate font-semibold">Impersonation active</div>
                <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto border-red-100/80 bg-white text-red-700 hover:bg-red-50 dark:hover:bg-red-800"
                    disabled={ending}
                    onClick={async () => {
                        setEnding(true);
                        try {
                            await $adminStopImpersonation();
                            await queryClient.cancelQueries();
                            queryClient.clear();
                            await router.invalidate();
                            if (typeof window !== 'undefined') {
                                window.location.assign('/admin/users');
                                return;
                            }
                            navigate({ to: '/admin/users' });
                        } catch (e: any) {
                            toast.error(e?.message ?? 'Could not end impersonation');
                        } finally {
                            setEnding(false);
                        }
                    }}
                >
                    {ending ? (
                        <>
                            <CircleNotchIcon className="animate-spin" />
                            Ending...
                        </>
                    ) : (
                        'End session'
                    )}
                </Button>
            </div>
        </div>
    );
}
