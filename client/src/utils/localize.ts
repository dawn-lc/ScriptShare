/**
 * 从脚本 i18n 数据中获取当前语言的本地化字段值。
 * 无本地化版本时回退到原始字段值。
 */
export function getLocalizedText(
    i18n: Record<string, Record<string, string>> | null | undefined,
    field: 'name' | 'description',
    currentLang: string,
    fallback: string,
): string {
    if (!i18n?.[field]) return fallback;
    // 优先精确匹配（如 'zh-CN'）
    if (i18n[field][currentLang]) return i18n[field][currentLang];
    // 尝试仅语言匹配（如从 'zh-CN' 取 'zh'）
    const langBase = currentLang.split('-')[0];
    for (const key of Object.keys(i18n[field])) {
        if (key.startsWith(langBase)) return i18n[field][key];
    }
    return fallback;
}

/**
 * 将数字格式化为带单位的紧凑形式，支持本地化。
 * 底层使用 Intl.NumberFormat notation=compact，内置支持各语言。
 * - zh: 10000 → 1万, 12345 → 1.2万, 100000000 → 1亿
 * - en: 1000 → 1K, 1234 → 1.2K, 1000000 → 1M, 1000000000 → 1B
 */
export function formatCount(n: number, lang: string): string {
    // 小于万 / 千的直接返回整数，避免 compact 输出 "1,000" 等千分位形式
    if (n < 1000 || (lang.startsWith('zh') && n < 10000)) return String(n);
    return new Intl.NumberFormat(lang, { notation: 'compact' }).format(n);
}
