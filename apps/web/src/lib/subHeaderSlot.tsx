import {
    createContext,
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
    useSyncExternalStore,
    type ReactNode
} from 'react';

type Listener = () => void;

function createSlotStore() {
    let node: ReactNode = null;
    const listeners = new Set<Listener>();
    return {
        getSnapshot: () => node,
        subscribe: (listener: Listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        set: (next: ReactNode) => {
            node = next;
            for (const l of listeners) l();
        },
        clear: () => {
            node = null;
            for (const l of listeners) l();
        }
    };
}

type SlotStore = ReturnType<typeof createSlotStore>;

const SubHeaderSlotContext = createContext<SlotStore | null>(null);

export function SubHeaderSlotProvider({ children }: { children: ReactNode }) {
    const storeRef = useRef<SlotStore>(null);
    if (!storeRef.current) storeRef.current = createSlotStore();
    return (
        <SubHeaderSlotContext.Provider value={storeRef.current}>
            {children}
        </SubHeaderSlotContext.Provider>
    );
}

/** Renders whatever a child page has slotted in */
export function SubHeaderSlotOutlet() {
    const store = useContext(SubHeaderSlotContext);
    const node = useSyncExternalStore(
        store?.subscribe ?? (() => () => {}),
        store?.getSnapshot ?? (() => null),
        () => null
    );
    return <>{node}</>;
}

/** Call from a tab page to inject toolbar content into the layout's fixed header */
export function useSubHeaderSlot(content: ReactNode) {
    const store = useContext(SubHeaderSlotContext);
    // Use layout effect so the slot is populated before paint
    useLayoutEffect(() => {
        store?.set(content);
    });
    // Clear on unmount
    useEffect(() => {
        return () => store?.clear();
    }, [store]);
}
