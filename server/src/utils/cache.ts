/**
 * 轻量级内存缓存。
 * 基于 Map + TTL，零依赖。
 * 用于缓存低频变更的高频读取查询（列表、统计等）。
 */

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 60_000; // 60 秒

/** 获取缓存值，命中且未过期时返回，否则返回 undefined */
export function getCache<T>(key: string): T | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return undefined;
    }
    return entry.data as T;
}

/** 设置缓存值 */
export function setCache<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
    store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/** 按前缀批量失效（如清空某表的所有缓存） */
export function invalidateCache(prefix: string): void {
    for (const key of store.keys()) {
        if (key.startsWith(prefix)) store.delete(key);
    }
}

/** 清除全部缓存 */
export function clearAllCache(): void {
    store.clear();
}

/** 缓存装饰器：读取时查缓存，写入时失效 */
export function cachedRepo<A extends unknown[], R>(
    fn: (...args: A) => Promise<R>,
    cacheKey: (...args: A) => string,
    ttlMs?: number,
): (...args: A) => Promise<R> {
    return async (...args: A): Promise<R> => {
        const key = cacheKey(...args);
        const cached = getCache<R>(key);
        if (cached !== undefined) return cached;
        const result = await fn(...args);
        setCache(key, result, ttlMs);
        return result;
    };
}
