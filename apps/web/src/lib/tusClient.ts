export function scrubInsecureTusResumeEntries() {
    if (typeof window === 'undefined') return;
    if (window.location.protocol !== 'https:') return;

    try {
        const keysToDelete: string[] = [];
        for (let i = 0; i < window.localStorage.length; i += 1) {
            const key = window.localStorage.key(i);
            if (!key || !key.startsWith('tus::')) continue;
            const value = window.localStorage.getItem(key);
            if (value && value.includes('http://')) {
                keysToDelete.push(key);
            }
        }
        for (const key of keysToDelete) {
            window.localStorage.removeItem(key);
        }
    } catch {
        // no-op: localStorage may be unavailable in strict privacy contexts
    }
}
