import { CircleNotchIcon, DiscoBallIcon } from '@phosphor-icons/react';
import authClient from '@repo/auth/auth-client';
import { authQueryOptions } from '@repo/auth/tanstack/queries';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { VirtualEmailKeyboard } from '@repo/ui/components/virtual-email-keyboard';
import { VirtualNumericKeypad } from '@repo/ui/components/virtual-numeric-keypad';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_guest/login')({
    component: LoginForm
});

const OTP_LENGTH = 6;

type View = 'email' | 'choose' | 'magic-link-sent' | 'otp';

function LoginForm() {
    const [view, setView] = useState<View>('email');
    const [email, setEmail] = useState('');

    const { mutate: sendMagicLink, isPending: isMagicLinkPending } = useMutation({
        mutationFn: async (addr: string) =>
            await authClient.signIn.magicLink(
                { email: addr, callbackURL: '/app' },
                {
                    onError: ({ error }) => {
                        toast.error(error.message || 'An error occurred while sending the link.');
                    },
                    onSuccess: () => {
                        setView('magic-link-sent');
                    }
                }
            )
    });

    const { mutate: sendOtp, isPending: isOtpSendPending } = useMutation({
        mutationFn: async (addr: string) =>
            await authClient.emailOtp.sendVerificationOtp(
                { email: addr, type: 'sign-in' },
                {
                    onError: ({ error }) => {
                        toast.error(error.message || 'An error occurred while sending the code.');
                    },
                    onSuccess: () => {
                        setView('otp');
                    }
                }
            )
    });

    const isSending = isMagicLinkPending || isOtpSendPending;

    const goBack = () => {
        setEmail('');
        setView('email');
    };

    if (view === 'email') {
        return (
            <EmailView
                onSubmit={(addr) => {
                    setEmail(addr);
                    setView('choose');
                }}
            />
        );
    }

    if (view === 'choose') {
        return (
            <div className="flex flex-col items-center gap-4 text-center">
                <Link to="/" className="flex flex-col items-center gap-2 font-medium">
                    <div className="flex h-12 w-12 items-center justify-center rounded-md">
                        <DiscoBallIcon className="size-12" />
                    </div>
                </Link>
                <h1 className="text-xl font-bold">How would you like to sign in?</h1>
                <p className="text-sm text-muted-foreground">
                    Signing in as <strong>{email}</strong>
                </p>
                <div className="flex w-full flex-col gap-3">
                    <Button
                        className="w-full"
                        size="lg"
                        disabled={isSending}
                        onClick={() => sendMagicLink(email)}
                    >
                        {isMagicLinkPending && <CircleNotchIcon className="animate-spin" />}
                        Send magic link
                    </Button>
                    <Button
                        variant="outline"
                        className="w-full"
                        size="lg"
                        disabled={isSending}
                        onClick={() => sendOtp(email)}
                    >
                        {isOtpSendPending && <CircleNotchIcon className="animate-spin" />}
                        Send a code instead
                    </Button>
                </div>
                <button
                    type="button"
                    className="text-sm text-muted-foreground underline underline-offset-4"
                    onClick={goBack}
                >
                    Use a different email
                </button>
            </div>
        );
    }

    if (view === 'magic-link-sent') {
        return (
            <div className="flex flex-col items-center gap-4 text-center">
                <Link to="/" className="flex flex-col items-center gap-2 font-medium">
                    <div className="flex h-12 w-12 items-center justify-center rounded-md">
                        <DiscoBallIcon className="size-12" />
                    </div>
                </Link>
                <h1 className="text-xl font-bold">Check your email</h1>
                <p className="text-muted-foreground">
                    We sent a magic link to <strong>{email}</strong>. Click the link in your email
                    to sign in.
                </p>
                <button
                    type="button"
                    className="text-sm text-muted-foreground underline underline-offset-4"
                    onClick={goBack}
                >
                    Use a different email
                </button>
            </div>
        );
    }

    return <OtpView email={email} onBack={goBack} />;
}

function EmailView({ onSubmit }: { onSubmit: (email: string) => void }) {
    const [value, setValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const handleVirtualKey = useCallback((key: string) => {
        setValue((prev) => prev + key);
        inputRef.current?.focus();
    }, []);

    const handleVirtualDelete = useCallback(() => {
        setValue((prev) => prev.slice(0, -1));
        inputRef.current?.focus();
    }, []);

    const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) return;
        onSubmit(trimmed);
    };

    return (
        <div className="flex flex-col items-center gap-4">
            <form onSubmit={handleSubmit} className="w-full">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col items-center gap-2">
                        <Link to="/" className="flex flex-col items-center gap-2 font-medium">
                            <div className="flex h-12 w-12 items-center justify-center rounded-md">
                                <DiscoBallIcon className="size-12" />
                            </div>
                            <span className="sr-only">GemmaShop</span>
                        </Link>
                        <h1 className="text-xl font-bold">Welcome to GemmaShop</h1>
                        <p className="text-sm text-muted-foreground">Enter your email to sign in</p>
                    </div>
                    <div className="flex flex-col gap-5">
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                ref={inputRef}
                                id="email"
                                name="email"
                                type="email"
                                placeholder="hello@imperial.ac.uk"
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                required
                            />
                        </div>
                        <Button type="submit" className="w-full" size="lg">
                            Continue
                        </Button>

                        <Link to="/">
                            <Button type="button" variant="secondary" className="w-full" size="lg">
                                Cancel
                            </Button>
                        </Link>
                    </div>
                </div>
            </form>

            <VirtualEmailKeyboard onKey={handleVirtualKey} onDelete={handleVirtualDelete} />
        </div>
    );
}

function OtpView({ email, onBack }: { email: string; onBack: () => void }) {
    const [digits, setDigits] = useState('');
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const { mutate: verifyOtp, isPending } = useMutation({
        mutationFn: async (otp: string) =>
            await authClient.signIn.emailOtp(
                { email, otp },
                {
                    onError: ({ error }) => {
                        toast.error(error.message || 'Invalid or expired code.');
                        setDigits('');
                    },
                    onSuccess: async () => {
                        queryClient.removeQueries({ queryKey: authQueryOptions().queryKey });
                        await navigate({ to: '/app' });
                    }
                }
            )
    });

    const appendDigit = useCallback(
        (d: string) => {
            if (isPending) return;
            setDigits((prev) => {
                if (prev.length >= OTP_LENGTH) return prev;
                const next = prev + d;
                if (next.length === OTP_LENGTH) {
                    verifyOtp(next);
                }
                return next;
            });
        },
        [isPending, verifyOtp]
    );

    const deleteDigit = useCallback(() => {
        if (isPending) return;
        setDigits((prev) => prev.slice(0, -1));
    }, [isPending]);

    return (
        <div className="flex flex-col items-center gap-4">
            <Link to="/" className="flex flex-col items-center gap-2 font-medium">
                <div className="flex h-12 w-12 items-center justify-center rounded-md">
                    <DiscoBallIcon className="size-12" />
                </div>
            </Link>
            <div className="text-center">
                <h1 className="text-xl font-bold">Enter your code</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    We sent a verification code to <strong>{email}</strong>
                </p>
            </div>

            {/* OTP digit display */}
            <div className="flex gap-2">
                {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                    <div
                        key={i}
                        className="flex h-12 w-10 items-center justify-center rounded-md border text-lg font-semibold"
                    >
                        {digits[i] ?? ''}
                    </div>
                ))}
            </div>

            {isPending && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CircleNotchIcon className="animate-spin" />
                    Verifying...
                </div>
            )}

            <VirtualNumericKeypad
                onDigit={appendDigit}
                onDelete={deleteDigit}
                disabled={isPending}
            />

            <button
                type="button"
                className="text-sm text-muted-foreground underline underline-offset-4"
                onClick={onBack}
            >
                Use a different email
            </button>
        </div>
    );
}
