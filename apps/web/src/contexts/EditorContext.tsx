import { createContext, useContext } from 'react';

// This context is no longer in use and will be removed.
// Please use `useEditorStore` from `~/lib/editorStore` instead.
export const useEditor = () => {
    throw new Error(
        'useEditor is deprecated. Please use `useEditorStore` from `~/lib/editorStore` instead.'
    );
};
