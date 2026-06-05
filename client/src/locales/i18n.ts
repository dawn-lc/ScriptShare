import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './zh-CN.json';
import enUS from './en-US.json';

const STORAGE_KEY = 'scriptshare_language';

/** Map a browser language string to one of our supported locale codes. */
function mapBrowserLang(browserLang: string): string {
    const lang = browserLang.toLowerCase();
    // Exact match
    if (lang === 'zh-cn' || lang === 'zh-hans') return 'zh-CN';
    if (lang === 'en-us') return 'en-US';
    // Language-only match
    if (lang.startsWith('zh')) return 'zh-CN';
    if (lang.startsWith('en')) return 'en-US';
    return 'zh-CN'; // default fallback
}

function getSavedLang(): string {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return stored;
    } catch { /* ignore */ }
    // Detect browser language
    if (typeof navigator !== 'undefined' && navigator.language) {
        return mapBrowserLang(navigator.language);
    }
    return 'zh-CN';
}

export const LANGUAGES = [
    { code: 'zh-CN', label: '简体中文' },
    { code: 'en-US', label: 'English' },
];

export const DEFAULT_LANG = 'zh-CN';
export const SUPPORTED_LANGS = ['zh-CN', 'en-US'];

i18n.use(initReactI18next).init({
    resources: {
        'zh-CN': { translation: zhCN },
        'en-US': { translation: enUS },
    },
    lng: getSavedLang(),
    fallbackLng: 'zh-CN',
    interpolation: {
        escapeValue: false,
    },
});

export function changeLanguage(lang: string) {
    try {
        localStorage.setItem(STORAGE_KEY, lang);
    } catch { /* ignore */ }
    i18n.changeLanguage(lang);
}

export default i18n;
