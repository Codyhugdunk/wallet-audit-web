// cache.ts — WalletAudit v1.0
// 轻量级内存缓存，用于减少重复 RPC & API 请求

interface CacheEntry<T> {
  value: T;
  expireAt: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();

// 默认缓存时间：30 秒
const DEFAULT_TTL = 30 * 1000;

export function cacheGet<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;

  // 是否过期
  if (Date.now() > entry.expireAt) {
    memoryCache.delete(key);
    return null;
  }

  return entry.value;
}

export function cacheSet<T>(key: string, value: T, ttl = DEFAULT_TTL) {
  memoryCache.set(key, {
    value,
    expireAt: Date.now() + ttl,
  });
}

// 清空缓存（可用于调试）
export function cacheClear() {
  memoryCache.clear();
}

// 包装一个异步函数并提供缓存能力
export async function cached<T>(
  key: string,
  ttl: number,
  fn: () => Promise<T>
): Promise<T> {
  const cachedValue = cacheGet<T>(key);
  if (cachedValue !== null) {
    return cachedValue;
  }

  const result = await fn();
  cacheSet(key, result, ttl);
  return result;
}