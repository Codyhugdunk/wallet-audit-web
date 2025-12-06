// fetch.ts — WalletAudit v1.0
// 全局 fetch 封装（支持超时、本地代理、fallback）

import { setTimeout as delay } from "timers/promises";
import { Agent } from "undici";

const DEFAULT_TIMEOUT = 8000;

// 本地环境判断：用于 fallback price / proxy agent
export const isLocal =
  process.env.PRICE_PROXY_BASE?.includes("localhost") ||
  process.env.NODE_ENV !== "production";

// 本地代理（因为 Node.js 默认不走 Clash）
let proxyAgent: Agent | null = null;

try {
  if (isLocal && process.env.HTTP_PROXY) {
    proxyAgent = new Agent({
      keepAliveTimeout: 10,
      keepAliveMaxTimeout: 10,
    });
  }
} catch (e) {
  proxyAgent = null;
}

export async function fetchJsonWithTimeout(url: string, options: any = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      dispatcher: proxyAgent ?? undefined,
    });

    if (!res.ok) {
      throw new Error(`Fetch failed: ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    if (isLocal) {
      // 本地被墙，直接返回 null，让上层 fallback
      return null;
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

// fetch text（偶尔需要）
export async function fetchTextWithTimeout(url: string, options: any = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      dispatcher: proxyAgent ?? undefined,
    });

    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);

    return await res.text();
  } catch (err) {
    if (isLocal) return null;
    throw err;
  } finally {
    clearTimeout(id);
  }
}