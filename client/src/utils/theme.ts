/**
 * Theme preference management.
 * Supports three modes: 'light' | 'dark' | 'system'.
 * Persists choice in localStorage and applies the `dark` class to <html>.
 */

const STORAGE_KEY = 'scriptshare-theme';

export type ThemeMode = 'light' | 'dark' | 'system';

/** Read the user's saved preference (defaults to 'system'). */
export function getThemeMode(): ThemeMode {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
    }
    return 'system';
}

/** Persist a new preference and apply it immediately. */
export function setThemeMode(mode: ThemeMode): void {
    localStorage.setItem(STORAGE_KEY, mode);
    applyThemeMode(mode);
}

/** Apply the given mode to the document without saving. */
function applyThemeMode(mode: ThemeMode): void {
    const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
}

/** Listen to OS theme changes — only relevant in 'system' mode. */
let mediaQuery: MediaQueryList | null = null;
let mediaHandler: ((e: MediaQueryListEvent) => void) | null = null;

export function initTheme(): void {
    // Apply on load
    applyThemeMode(getThemeMode());

    // Watch OS changes
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaHandler = (e: MediaQueryListEvent) => {
        if (getThemeMode() === 'system') {
            document.documentElement.classList.toggle('dark', e.matches);
        }
    };
    mediaQuery.addEventListener('change', mediaHandler);
}

/** Cleanup listener — call on unmount if needed. */
export function destroyTheme(): void {
    if (mediaQuery && mediaHandler) {
        mediaQuery.removeEventListener('change', mediaHandler);
    }
}
