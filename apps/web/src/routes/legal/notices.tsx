import { Button } from '@repo/ui/components/button';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

type ThirdPartyPackage = {
    name: string;
    version: string;
    license: string;
    repository: string | null;
    homepage: string | null;
    author: string | null;
    licenseFiles: string[];
    licenseText: string | null;
};

type ThirdPartyNoticePayload = {
    generatedAt: string;
    packageCount: number;
    packages: ThirdPartyPackage[];
};

export const Route = createFileRoute('/legal/notices')({
    component: LegalNoticesPage
});

function LegalNoticesPage() {
    const [data, setData] = useState<ThirdPartyNoticePayload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const noticesJsonUrl = `${import.meta.env.BASE_URL}third-party-notices.json`;
    const noticesTxtUrl = `${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`;

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const response = await fetch(noticesJsonUrl);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const payload = (await response.json()) as ThirdPartyNoticePayload;
                if (!cancelled) setData(payload);
            } catch (err) {
                if (!cancelled) {
                    const reason = err instanceof Error ? err.message : String(err);
                    setError(reason);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [noticesJsonUrl]);

    const grouped = useMemo(() => {
        if (!data) return [];
        const byLicense = new Map<string, ThirdPartyPackage[]>();
        for (const pkg of data.packages) {
            const key = pkg.license || 'UNKNOWN';
            const arr = byLicense.get(key) ?? [];
            arr.push(pkg);
            byLicense.set(key, arr);
        }
        return Array.from(byLicense.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([license, pkgs]) => ({
                license,
                packages: pkgs.sort((a, b) => a.name.localeCompare(b.name))
            }));
    }, [data]);

    return (
        <main className="container mx-auto max-w-5xl p-4 pt-24 pb-24">
            <div className="mb-4">
                <Button
                    variant="outline"
                    onClick={() => {
                        if (window.history.length > 1) {
                            window.history.back();
                            return;
                        }
                        window.location.href = '/';
                    }}
                >
                    Back
                </Button>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Third-Party Notices</h1>
            <p className="mt-3 text-sm text-muted-foreground">
                This page is generated from tree-shaken dependencies in the production build.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <a className="underline" href={noticesTxtUrl} download>
                    Download full notice file
                </a>
            </div>

            {error ? (
                <div className="mt-6 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm">
                    Failed to load notice artifact: <code>{error}</code>. Build the web app once to
                    generate <code>{noticesJsonUrl}</code>.
                </div>
            ) : null}

            {!data && !error ? (
                <div className="mt-6 text-sm text-muted-foreground">Loading…</div>
            ) : null}

            {data ? (
                <>
                    <div className="mt-6 text-sm text-muted-foreground">
                        Generated:{' '}
                        {data.generatedAt
                            ? new Date(data.generatedAt).toLocaleString()
                            : 'not generated yet'}{' '}
                        | Packages: {data.packageCount}
                    </div>

                    {data.packageCount === 0 ? (
                        <div className="mt-4 rounded-md border p-3 text-sm text-muted-foreground">
                            No generated package data yet. Run a production build to generate the
                            full tree-shaken notice set.
                        </div>
                    ) : null}

                    <div className="mt-6 space-y-6">
                        {grouped.map((group) => (
                            <section key={group.license} className="rounded-lg border p-4">
                                <h2 className="text-xl font-medium">{group.license}</h2>
                                <div className="mt-3 space-y-4">
                                    {group.packages.map((pkg) => (
                                        <details
                                            key={`${pkg.name}@${pkg.version}`}
                                            className="rounded border p-3"
                                        >
                                            <summary className="cursor-pointer text-sm font-medium">
                                                {pkg.name}@{pkg.version}
                                            </summary>
                                            <div className="mt-3 space-y-2 text-sm">
                                                <div>
                                                    <span className="font-medium">Author:</span>{' '}
                                                    {pkg.author ?? 'N/A'}
                                                </div>
                                                <div>
                                                    <span className="font-medium">Repository:</span>{' '}
                                                    {pkg.repository ? (
                                                        <a
                                                            className="underline"
                                                            href={pkg.repository}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                        >
                                                            {pkg.repository}
                                                        </a>
                                                    ) : (
                                                        'N/A'
                                                    )}
                                                </div>
                                                <div>
                                                    <span className="font-medium">Homepage:</span>{' '}
                                                    {pkg.homepage ? (
                                                        <a
                                                            className="underline"
                                                            href={pkg.homepage}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                        >
                                                            {pkg.homepage}
                                                        </a>
                                                    ) : (
                                                        'N/A'
                                                    )}
                                                </div>
                                                <div>
                                                    <span className="font-medium">
                                                        License files:
                                                    </span>{' '}
                                                    {pkg.licenseFiles.length > 0
                                                        ? pkg.licenseFiles.join(', ')
                                                        : 'N/A'}
                                                </div>
                                                <pre className="max-h-96 overflow-auto rounded bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap">
                                                    {pkg.licenseText ??
                                                        'License text not found in package files.'}
                                                </pre>
                                            </div>
                                        </details>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                </>
            ) : null}
        </main>
    );
}
