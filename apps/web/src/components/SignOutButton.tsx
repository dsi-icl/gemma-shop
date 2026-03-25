import authClient from '@repo/auth/auth-client';
import { authQueryOptions } from '@repo/auth/tanstack/queries';
import { Button } from '@repo/ui/components/button';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';

export function SignOutButton() {
    const queryClient = useQueryClient();
    const router = useRouter();
    return (
        <Button
            onClick={async () => {
                await authClient.signOut({
                    fetchOptions: {
                        onSuccess: async () => {
                            queryClient.setQueryData(authQueryOptions().queryKey, null);
                            await router.invalidate();
                        },
                        onError: async (ctx) => {
                            const message =
                                (ctx as any)?.error?.message ||
                                (ctx as any)?.error?.statusText ||
                                'Sign out failed';
                            toast.error(message);
                            queryClient.setQueryData(authQueryOptions().queryKey, null);
                            await router.invalidate();
                        }
                    }
                });
            }}
            type="button"
            className="w-fit"
            variant="destructive"
            size="lg"
        >
            Sign out
        </Button>
    );
}
