import {
    createContext,
    useContext,
    useLayoutEffect,
    useState,
    useSyncExternalStore,
    type ReactNode
} from 'react';

type Listener = () => void;

function createSlotStore() {
    let node: ReactNode = null;
    let seq = 0;
    const ownedNodes = new Map<symbol, { node: ReactNode; seq: number }>();
    const listeners = new Set<Listener>();

    const emit = () => {
        for (const l of listeners) l();
    };

    const recomputeNode = () => {
        let latestSeq = -1;
        let latestNode: ReactNode = null;
        for (const entry of ownedNodes.values()) {
            if (entry.seq > latestSeq) {
                latestSeq = entry.seq;
                latestNode = entry.node;
            }
        }
        node = latestNode;
    };

    return {
        getSnapshot: () => node,
        subscribe: (listener: Listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        set: (owner: symbol, next: ReactNode) => {
            seq += 1;
            ownedNodes.set(owner, { node: next, seq });
            recomputeNode();
            emit();
        },
        clear: (owner: symbol) => {
            if (!ownedNodes.delete(owner)) return;
            recomputeNode();
            emit();
        }
    };
}

type SlotStore = ReturnType<typeof createSlotStore>;

const SubHeaderSlotContext = createContext<SlotStore | null>(null);

export function SubHeaderSlotProvider({ children }: { children: ReactNode }) {
    const [store] = useState<SlotStore>(() => createSlotStore());
    return <SubHeaderSlotContext.Provider value={store}>{children}</SubHeaderSlotContext.Provider>;
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
    const [owner] = useState(() => Symbol('sub-header-slot-owner'));

    // Use layout effect so the slot is populated before paint
    useLayoutEffect(() => {
        store?.set(owner, content);
        return () => store?.clear(owner);
    }, [content, owner, store]);
}
