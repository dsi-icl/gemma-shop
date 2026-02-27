export type UnionToRecord<U extends { key: string; value: any }> = {
    [K in U['key']]: Extract<U, { key: K }>['value'];
};
