export function FontPlaceholder({ name, className = '' }: { name: string; className?: string }) {
    return (
        <div
            className={`flex items-center justify-center rounded-md bg-muted text-muted-foreground ${className}`}
        >
            <div className="flex flex-col items-center gap-1">
                <span className="rounded bg-background px-1.5 py-0.5 text-[9px] font-semibold tracking-wide">
                    WOFF2
                </span>
                <span className="max-w-[90%] truncate text-[10px]">
                    {name.replace(/\.woff2$/i, '')}
                </span>
            </div>
        </div>
    );
}
