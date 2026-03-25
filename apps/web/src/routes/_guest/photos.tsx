import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState, type CSSProperties } from 'react';

export const Route = createFileRoute('/_guest/photos')({
    component: PhotosPage
});

const REMOTE_API_URL = 'https://gems.dsi.ic.ac.uk/api/portal/v1/reboot';
const ROWS = 20;
const COLS = 5;

function PhotosPage() {
    const [lastAction, setLastAction] = useState<string>('Ready.');
    const [busyKey, setBusyKey] = useState<string | null>(null);

    const token = useMemo(() => {
        if (typeof window === 'undefined') return '';
        const params = new URLSearchParams(window.location.search);
        return params.get('_gem_t') ?? '';
    }, []);

    const triggerReboot = async (c: number, r: number) => {
        const key = `${c}:${r}`;
        setBusyKey(key);
        setLastAction(`Calling reboot at c=${c}, r=${r}...`);

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };
            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }

            const response = await fetch(REMOTE_API_URL, {
                method: 'POST',
                headers,
                body: JSON.stringify({ c, r })
            });

            const payload = await response
                .json()
                .catch(() => ({ error: 'Non-JSON response received' }));

            if (!response.ok) {
                const message =
                    typeof payload?.error === 'string' ? payload.error : `HTTP ${response.status}`;
                throw new Error(message);
            }

            setLastAction(`Success at c=${c}, r=${r}`);
        } catch (error: any) {
            setLastAction(`Failed at c=${c}, r=${r}: ${error?.message ?? 'Unknown error'}`);
        } finally {
            setBusyKey(null);
        }
    };

    const pageStyle: CSSProperties = {
        position: 'fixed',
        zIndex: 100000,
        inset: 0,
        overflow: 'hidden',
        fontFamily: '"Comic Sans MS", "Trebuchet MS", Verdana, sans-serif',
        color: '#001133',
        background:
            'repeating-linear-gradient(45deg,#eaf6ff 0,#eaf6ff 16px,#d3ecff 16px,#d3ecff 32px)'
    };

    const leftPanelStyle: CSSProperties = {
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        width: 320,
        padding: '14px 12px',
        borderRight: '4px ridge #9ac6ff',
        background:
            'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(210,235,255,0.95) 100%)',
        boxSizing: 'border-box',
        overflowY: 'auto'
    };

    const gridWrapStyle: CSSProperties = {
        marginLeft: 334,
        height: '100%',
        overflow: 'auto',
        padding: 18,
        boxSizing: 'border-box'
    };

    const gridStyle: CSSProperties = {
        display: 'grid',
        gridTemplateColumns: `repeat(${COLS}, minmax(90px, 1fr))`,
        gap: 10
    };

    return (
        <div style={pageStyle}>
            <div style={leftPanelStyle}>
                <h1
                    style={{
                        margin: 0,
                        marginBottom: 10,
                        fontSize: 28,
                        color: '#003f8a',
                        textShadow: '1px 1px #fff'
                    }}
                >
                    PHOTO CONTROL 1998
                </h1>
                <p style={{ marginTop: 0, marginBottom: 10, fontSize: 14 }}>
                    Totally rad swap control panel.
                    <br />
                    Click a tile to call GEMZ Maker:
                    <br />
                    <code style={{ fontSize: 11 }}>{REMOTE_API_URL}</code>
                </p>
                <div
                    style={{
                        border: '3px inset #9ecbff',
                        background: '#ffffff',
                        padding: 8,
                        fontSize: 13,
                        minHeight: 64
                    }}
                >
                    <strong>Status:</strong>
                    <div style={{ marginTop: 6 }}>{lastAction}</div>
                </div>
                <div style={{ marginTop: 10, fontSize: 12 }}>
                    Token from query param <code>_gem_t</code>:{' '}
                    {token ? 'detected' : 'not provided'}
                </div>
            </div>

            <div style={gridWrapStyle}>
                <div
                    style={{
                        marginBottom: 12,
                        fontWeight: 'bold',
                        fontSize: 16
                    }}
                >
                    20x5 Reboot Grid
                </div>
                <div style={gridStyle}>
                    {Array.from({ length: ROWS * COLS }, (_, i) => {
                        const r = Math.floor(i / COLS);
                        const c = i % COLS;
                        const key = `${c}:${r}`;
                        const isBusy = busyKey === key;

                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => void triggerReboot(c, r)}
                                disabled={Boolean(busyKey)}
                                style={{
                                    padding: '10px 12px',
                                    border: '3px outset #7eaee6',
                                    background: isBusy ? '#f7e29f' : '#cce7ff',
                                    color: '#052c57',
                                    fontSize: 14,
                                    fontWeight: 700,
                                    cursor: busyKey ? 'wait' : 'pointer'
                                }}
                            >
                                {isBusy ? 'SENDING...' : `C=${c} / R=${r}`}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
