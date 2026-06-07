/**
 * 主题偏好管理。
 * 支持三种模式：'light' | 'dark' | 'system'。
 * 将选择持久化到 localStorage 并控制 <html> 上的 `dark` 类。
 */

const STORAGE_KEY = 'scriptshare-theme';

export type ThemeMode = 'light' | 'dark' | 'system';

/** 读取用户保存的主题偏好（默认 'system'）。 */
export function getThemeMode(): ThemeMode {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
    }
    return 'system';
}

/** 持久化新偏好并立即应用。 */
export function setThemeMode(mode: ThemeMode): void {
    localStorage.setItem(STORAGE_KEY, mode);
    applyThemeMode(mode);
}

/** 将指定模式应用到文档（不保存）。 */
function applyThemeMode(mode: ThemeMode): void {
    const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
}

/** 监听系统主题变化（仅在 'system' 模式下相关）。 */
let mediaQuery: MediaQueryList | null = null;
let mediaHandler: ((e: MediaQueryListEvent) => void) | null = null;

export function initTheme(): void {
    // 加载时应用
    applyThemeMode(getThemeMode());

    // 监听系统变化
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaHandler = (e: MediaQueryListEvent) => {
        if (getThemeMode() === 'system') {
            document.documentElement.classList.toggle('dark', e.matches);
        }
    };
    mediaQuery.addEventListener('change', mediaHandler);
}

/** 清理监听器 — 卸载时调用。 */
export function destroyTheme(): void {
    if (mediaQuery && mediaHandler) {
        mediaQuery.removeEventListener('change', mediaHandler);
    }
}
