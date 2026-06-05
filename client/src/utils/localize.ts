/**
 * Get localized field value from script i18n data based on current language.
 * Falls back to the original field value if no localized version exists.
 */
export function getLocalizedText(
    i18n: Record<string, Record<string, string>> | null | undefined,
    field: 'name' | 'description',
    currentLang: string,
    fallback: string,
): string {
    if (!i18n?.[field]) return fallback;
    // Try exact match (e.g., 'zh-CN')
    if (i18n[field][currentLang]) return i18n[field][currentLang];
    // Try language-only match (e.g., 'zh' from 'zh-CN')
    const langBase = currentLang.split('-')[0];
    for (const key of Object.keys(i18n[field])) {
        if (key.startsWith(langBase)) return i18n[field][key];
    }
    return fallback;
}
