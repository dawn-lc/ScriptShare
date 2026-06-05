import { useEffect } from 'react';
import { initTheme, destroyTheme } from './theme';

/**
 * Initialises theme on mount (reads localStorage preference,
 * listens for OS `prefers-color-scheme` changes).
 */
export function useSystemTheme() {
    useEffect(() => {
        initTheme();
        return () => destroyTheme();
    }, []);
}
