import { WarningCircleIcon } from '@phosphor-icons/react';
import { Button } from '@repo/ui/components/button';
import {
    ErrorComponent,
    type ErrorComponentProps,
    Link,
    rootRouteId,
    useMatch,
    useRouter
} from '@tanstack/react-router';

function coerceStatus(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function getHttpStatus(error: unknown): number | null {
    if (!error || typeof error !== 'object') return null;
    const e = error as Record<string, unknown>;
    return (
        coerceStatus(e.status) ??
        coerceStatus(e.statusCode) ??
        coerceStatus(
            e.response && typeof e.response === 'object'
                ? (e.response as Record<string, unknown>).status
                : null
        )
    );
}

export function DefaultCatchBoundary({ error }: Readonly<ErrorComponentProps>) {
    const router = useRouter();
    const isRoot = useMatch({
        strict: false,
        select: (state) => state.id === rootRouteId
    });
    const status = getHttpStatus(error);
    const isServer5xx = status !== null && status >= 500 && status <= 599;

    console.error(error);

    if (isServer5xx) {
        return (
            <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-neutral-900 p-6 text-center text-neutral-300">
                <WarningCircleIcon size={64} weight="thin" />
                <p className="text-xl">Temporary server issue</p>
                <p className="max-w-xl text-sm text-neutral-400">
                    We could not complete this request right now. Please try again in a moment.
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                    <Button
                        type="button"
                        onClick={async () => {
                            await router.invalidate();
                        }}
                    >
                        Try Again
                    </Button>
                    {isRoot ? (
                        <Button render={<Link to="/" />} variant="secondary" nativeButton={false}>
                            Home
                        </Button>
                    ) : (
                        <Button
                            render={
                                <Link
                                    to="/"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        window.history.back();
                                    }}
                                />
                            }
                            variant="secondary"
                            nativeButton={false}
                        >
                            Go Back
                        </Button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 p-4">
            <ErrorComponent error={error} />
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    onClick={async () => {
                        await router.invalidate();
                    }}
                >
                    Try Again
                </Button>
                {isRoot ? (
                    <Button render={<Link to="/" />} variant="secondary" nativeButton={false}>
                        Home
                    </Button>
                ) : (
                    <Button
                        render={
                            <Link
                                to="/"
                                onClick={(e) => {
                                    e.preventDefault();
                                    window.history.back();
                                }}
                            />
                        }
                        variant="secondary"
                        nativeButton={false}
                    >
                        Go Back
                    </Button>
                )}
            </div>
        </div>
    );
}
