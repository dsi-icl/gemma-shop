import { CircleNotchIcon, WifiHighIcon, WifiSlashIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { useEditorStore } from '~/lib/editorStore';

const recoveredStore = (() => {
    let show = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const listeners = new Set<() => void>();
    const notify = () => listeners.forEach((l) => l());
    return {
        flash() {
            if (timer) clearTimeout(timer);
            show = true;
            notify();
            timer = setTimeout(() => {
                show = false;
                timer = null;
                notify();
            }, 2000);
        },
        subscribe(cb: () => void) {
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
        getSnapshot() {
            return show;
        }
    };
})();

export function ConnectionBanner() {
    const connectionStatus = useEditorStore((s) => s.connectionStatus);
    const showRecovered = useSyncExternalStore(
        (cb) => recoveredStore.subscribe(cb),
        () => recoveredStore.getSnapshot()
    );
    const wasDisconnectedRef = useRef(false);

    useEffect(() => {
        if (connectionStatus === 'reconnecting' || connectionStatus === 'disconnected') {
            wasDisconnectedRef.current = true;
        } else if (connectionStatus === 'connected' && wasDisconnectedRef.current) {
            wasDisconnectedRef.current = false;
            recoveredStore.flash();
        }
    }, [connectionStatus]);

    if (connectionStatus === 'reconnecting') {
        return (
            <div className="flex items-center justify-center gap-2 bg-yellow-500/90 px-3 py-1.5 text-sm font-medium text-yellow-950">
                <CircleNotchIcon className="h-4 w-4 animate-spin" />
                Reconnecting to server...
            </div>
        );
    }

    if (connectionStatus === 'disconnected') {
        return (
            <div className="flex items-center justify-center gap-2 bg-red-500/90 px-3 py-1.5 text-sm font-medium text-white">
                <WifiSlashIcon className="h-4 w-4" />
                Connection lost — please refresh the page
            </div>
        );
    }

    if (showRecovered) {
        return (
            <div className="flex items-center justify-center gap-2 bg-green-500/90 px-3 py-1.5 text-sm font-medium text-green-950">
                <WifiHighIcon className="h-4 w-4" />
                Reconnected
            </div>
        );
    }

    return null;
}
