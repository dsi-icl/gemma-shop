import { Button } from '@repo/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@repo/ui/components/dialog';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Scanner, type IDetectedBarcode } from '@yudiel/react-qr-scanner';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { $adminDevicesEnrollBySignature } from '~/server/admin.fns';
import { adminDevicesForWallQueryOptions, adminDevicesQueryOptions } from '~/server/admin.queries';

export const Route = createFileRoute('/admin/walls/$wallId/devices')({
    component: WallDevicesTab
});

function WallDevicesTab() {
    const { wallId } = Route.useParams();
    const queryClient = useQueryClient();
    const { data: devices = [] } = useSuspenseQuery(adminDevicesForWallQueryOptions(wallId));
    const { data: allDevices = [] } = useQuery(adminDevicesQueryOptions());
    const [scanDialogOpen, setScanDialogOpen] = useState(false);
    const [scanStatus, setScanStatus] = useState<string>('Ready to scan');
    const [cameraPermission, setCameraPermission] = useState<
        'unknown' | 'prompt' | 'granted' | 'denied'
    >('unknown');
    const [cameraReady, setCameraReady] = useState(false);
    const [scannerKey, setScannerKey] = useState(0);
    const [scanEvents, setScanEvents] = useState<Array<{ id: string; text: string; ok: boolean }>>(
        []
    );
    const seenPayloadsRef = useRef(new Set<string>());
    const processingRef = useRef(false);

    useEffect(() => {
        if (!scanDialogOpen) return;
        setScanStatus('Checking camera access...');
        setCameraPermission('unknown');
        setCameraReady(false);
        seenPayloadsRef.current.clear();
        setScanEvents([]);

        void (async () => {
            try {
                const permissionsApi = (navigator as any).permissions;
                if (!permissionsApi?.query) {
                    setScanStatus('Allow camera access to scan device QR codes.');
                    return;
                }

                const permission = await permissionsApi.query({ name: 'camera' });
                const nextState = permission.state as 'prompt' | 'granted' | 'denied';
                setCameraPermission(nextState);

                if (nextState === 'granted') {
                    setScanStatus('Scanning... Keep moving between screens.');
                    setCameraReady(true);
                } else if (nextState === 'prompt') {
                    setScanStatus('Tap Enable Camera to continue.');
                } else {
                    setScanStatus('Camera access is blocked. Enable camera permission and retry.');
                }
            } catch {
                setScanStatus('Tap Enable Camera to continue.');
            }
        })();
    }, [scanDialogOpen]);

    const requestCameraPermission = async () => {
        setScanStatus('Requesting camera access...');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } },
                audio: false
            });
            for (const track of stream.getTracks()) track.stop();
            setCameraPermission('granted');
            setCameraReady(true);
            setScanStatus('Scanning... Keep moving between screens.');
            setScannerKey((current) => current + 1);
        } catch (error: any) {
            const errorName = error?.name ?? '';
            if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
                setCameraPermission('denied');
                setCameraReady(false);
                setScanStatus('Camera access is blocked. Enable camera permission and retry.');
                return;
            }
            setCameraReady(false);
            setScanStatus('Camera unavailable. Check permissions and retry.');
        }
    };

    const pushEvent = (text: string, ok: boolean) => {
        setScanEvents((prev) =>
            [{ id: `${Date.now()}-${Math.random()}`, text, ok }, ...prev].slice(0, 20)
        );
    };

    const parsePayload = (raw: string) => {
        try {
            const parsed = JSON.parse(raw) as {
                did?: string;
                sig?: string;
            };
            const deviceId = parsed.did;
            const signature = parsed.sig;
            if (typeof deviceId !== 'string' || typeof signature !== 'string') {
                return null;
            }
            return {
                deviceId,
                signature
            } as const;
        } catch {
            return null;
        }
    };

    const handleScan = async (detectedCodes: IDetectedBarcode[]) => {
        if (!scanDialogOpen || processingRef.current) return;
        if (cameraPermission !== 'granted' && cameraPermission !== 'prompt') return;

        for (const detection of detectedCodes) {
            const raw = detection.rawValue?.trim();
            if (!raw || seenPayloadsRef.current.has(raw)) continue;
            seenPayloadsRef.current.add(raw);
            const payload = parsePayload(raw);
            if (!payload) {
                pushEvent('Skipped: QR is not a valid enrollment payload', false);
                continue;
            }
            const kind = (
                allDevices as Array<{ deviceId: string; kind?: 'wall' | 'gallery' | 'controller' }>
            ).find((d) => d.deviceId === payload.deviceId)?.kind;
            if (!kind) {
                pushEvent(`Failed ${payload.deviceId.slice(0, 8)}...: unknown device kind`, false);
                continue;
            }

            processingRef.current = true;
            try {
                await $adminDevicesEnrollBySignature({
                    data: {
                        deviceId: payload.deviceId,
                        signature: payload.signature,
                        kind,
                        wallId
                    }
                });
                await Promise.all([
                    queryClient.invalidateQueries({
                        queryKey: adminDevicesForWallQueryOptions(wallId).queryKey
                    }),
                    queryClient.invalidateQueries({ queryKey: ['admin', 'devices'] }),
                    queryClient.invalidateQueries({ queryKey: ['admin', 'walls'] })
                ]);
                pushEvent(`Enrolled ${payload.kind} ${payload.deviceId.slice(0, 8)}...`, true);
                toast.success(`Device enrolled: ${payload.deviceId.slice(0, 8)}...`);
            } catch (error: any) {
                pushEvent(
                    `Failed ${payload.deviceId.slice(0, 8)}...: ${error?.message ?? 'Unknown error'}`,
                    false
                );
            } finally {
                processingRef.current = false;
            }
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button onClick={() => setScanDialogOpen(true)}>Enroll Devices</Button>
            </div>
            <div className="rounded-lg border border-border">
                {(devices as Array<any>).length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                        No devices assigned to this wall yet.
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium">Device ID</th>
                                <th className="px-4 py-3 text-left font-medium">Kind</th>
                                <th className="px-4 py-3 text-left font-medium">Status</th>
                                <th className="px-4 py-3 text-left font-medium">Last Seen</th>
                                <th className="px-4 py-3 text-left font-medium">Updated</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {(devices as Array<any>).map((device) => (
                                <tr key={device.deviceId} className="hover:bg-muted/30">
                                    <td className="px-4 py-3 font-mono text-xs">
                                        {device.deviceId}
                                    </td>
                                    <td className="px-4 py-3 capitalize">{device.kind}</td>
                                    <td className="px-4 py-3 capitalize">{device.status}</td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground">
                                        {device.lastSeenAt ?? '—'}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground">
                                        {device.updatedAt ?? '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <Dialog open={scanDialogOpen} onOpenChange={setScanDialogOpen}>
                <DialogContent className="max-w-xl p-5">
                    <DialogTitle>Enroll Devices</DialogTitle>
                    <DialogDescription className="mt-1">
                        Point your camera at each screen QR code. Scanning stays active until you
                        press Done.
                    </DialogDescription>

                    <div className="mt-4 space-y-3">
                        <div className="overflow-hidden rounded-lg border border-border bg-black">
                            {cameraReady ? (
                                <Scanner
                                    key={scannerKey}
                                    onScan={(codes) => void handleScan(codes)}
                                    onError={(error: any) => {
                                        const errorName = error?.name ?? '';
                                        if (
                                            errorName === 'NotAllowedError' ||
                                            errorName === 'PermissionDeniedError'
                                        ) {
                                            setCameraPermission('denied');
                                            setCameraReady(false);
                                            setScanStatus(
                                                'Camera access is blocked. Enable camera permission and retry.'
                                            );
                                            return;
                                        }

                                        setScanStatus(
                                            'Camera unavailable. Check permissions and retry.'
                                        );
                                    }}
                                    constraints={{ facingMode: { ideal: 'environment' } }}
                                    formats={['qr_code']}
                                    sound={false}
                                    paused={!scanDialogOpen || cameraPermission === 'denied'}
                                    scanDelay={250}
                                    classNames={{
                                        container: 'h-72 w-full',
                                        video: 'h-72 w-full object-cover'
                                    }}
                                />
                            ) : (
                                <div className="flex h-72 w-full items-center justify-center text-sm text-muted-foreground">
                                    Camera is not active yet.
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">{scanStatus}</p>
                        <div className="flex justify-end gap-2">
                            {!cameraReady ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => void requestCameraPermission()}
                                >
                                    Enable Camera
                                </Button>
                            ) : null}
                            {cameraPermission === 'denied' ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => void requestCameraPermission()}
                                >
                                    Retry Camera
                                </Button>
                            ) : null}
                        </div>
                        <div className="max-h-40 overflow-auto rounded border border-border bg-muted/20 p-2 text-xs">
                            {scanEvents.length === 0 ? (
                                <div className="text-muted-foreground">No scans yet.</div>
                            ) : (
                                <div className="space-y-1">
                                    {scanEvents.map((event) => (
                                        <div
                                            key={event.id}
                                            className={
                                                event.ok ? 'text-emerald-600' : 'text-rose-600'
                                            }
                                        >
                                            {event.text}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 flex justify-end">
                        <Button variant="outline" onClick={() => setScanDialogOpen(false)}>
                            Done
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
