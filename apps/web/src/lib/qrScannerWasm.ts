import { prepareZXingModule } from 'barcode-detector';
import readerWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

let configured = false;

export function configureQrScannerWasm() {
    if (configured || typeof window === 'undefined') return;

    void prepareZXingModule({
        overrides: {
            locateFile: (path: string, prefix: string) =>
                path.endsWith('.wasm') ? readerWasmUrl : `${prefix}${path}`
        },
        fireImmediately: true
    });

    configured = true;
}
