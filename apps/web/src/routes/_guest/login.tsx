import { CircleNotchIcon, DiscoBallIcon } from '@phosphor-icons/react';
import authClient from '@repo/auth/auth-client';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_guest/login')({
    component: LoginForm
});

function LoginForm() {
    const [sent, setSent] = useState(false);

    const { mutate: sendMagicLink, isPending } = useMutation({
        mutationFn: async (email: string) =>
            await authClient.signIn.magicLink(
                { email, callbackURL: '/app' },
                {
                    onError: ({ error }) => {
                        toast.error(error.message || 'An error occurred while sending the link.');
                    },
                    onSuccess: () => {
                        setSent(true);
                    }
                }
            )
    });

    const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isPending) return;

        const formData = new FormData(e.currentTarget);
        const email = formData.get('email') as string;

        if (!email) return;

        sendMagicLink(email);
    };

    if (sent) {
        return (
            <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-md">
                    <DiscoBallIcon className="size-6" />
                </div>
                <h1 className="text-xl font-bold">Check your email</h1>
                <p className="text-muted-foreground">
                    We sent you a magic link. Click the link in your email to sign in.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <form onSubmit={handleSubmit}>
                <div className="flex flex-col gap-6">
                    <div className="flex flex-col items-center gap-2">
                        <a
                            href="https://mugnavo.com"
                            className="flex flex-col items-center gap-2 font-medium"
                        >
                            <div className="flex h-8 w-8 items-center justify-center rounded-md">
                                <DiscoBallIcon className="size-6" />
                            </div>
                            <span className="sr-only">GemmaShop</span>
                        </a>
                        <h1 className="text-xl font-bold">Welcome to GemmaShop</h1>
                        <p className="text-sm text-muted-foreground">
                            Enter your email to receive a magic link
                        </p>
                    </div>
                    <div className="flex flex-col gap-5">
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                placeholder="hello@example.com"
                                readOnly={isPending}
                                required
                            />
                        </div>
                        <Button
                            type="submit"
                            className="mt-2 w-full"
                            size="lg"
                            disabled={isPending}
                        >
                            {isPending && <CircleNotchIcon className="animate-spin" />}
                            {isPending ? 'Sending link...' : 'Send magic link'}
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    );
}
