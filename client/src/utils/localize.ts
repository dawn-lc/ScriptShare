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
 * - zh: 10000 → 1万, 12345 → 1.2万, 100000000 → 1亿
 * - en/其他: 1000 → 1K, 1234 → 1.2K, 1000000 → 1M, 1000000000 → 1B
 */
export function formatCount(n: number, lang: string): string {
    if (n < 10000) return String(n);

    const isZh = lang.startsWith('zh');

    if (isZh) {
        if (n >= 100000000) {
            const v = n / 100000000;
            return (v % 1 === 0 ? v : Math.round(v * 10) / 10) + '亿';
        }
        const v = n / 10000;
        return (v % 1 === 0 ? v : Math.round(v * 10) / 10) + '万';
    }

    // 非中文：K / M / B
    if (n >= 1000000000) {
        const v = n / 1000000000;
        return (v % 1 === 0 ? v : Math.round(v * 10) / 10) + 'B';
    }
    if (n >= 1000000) {
        const v = n / 1000000;
        return (v % 1 === 0 ? v : Math.round(v * 10) / 10) + 'M';
    }
    const v = n / 1000;
    return (v % 1 === 0 ? v : Math.round(v * 10) / 10) + 'K';
}
