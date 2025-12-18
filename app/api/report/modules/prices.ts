// app/api/report/modules/prices.ts
// v3.4 - Price Reliability Upgrade: Multi-source ETH, Chunked Token Prices

import { cached } from "../utils/cache";
import { fetchJsonWithTimeout } from "../utils/fetch";

const FALLBACK_ETH_PRICE = 3000; // ✅ 永远不要是 0（避免你看到“巨鲸=0”时更难判断到底哪里坏了）

function toNum(x: any): number | null {
  const n = Number(x);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

// ✅ ETH：Binance -> CoinGecko -> fallback
export async function getEthPrice(): Promise<number> {
  const key = "eth-price-usd";
  return cached(key, 60 * 1000, async () => {
    // 1) Binance
    try {
      const binanceRes: any = await fetchJsonWithTimeout(
        "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT",
        {},
        2500
      );
      const p = toNum(binanceRes?.price);
      if (p) return p;
    } catch {
      // ignore
    }

    // 2) CoinGecko simple price
    try {
      const cgRes: any = await fetchJsonWithTimeout(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
        {},
        3000
      );
      const p = toNum(cgRes?.ethereum?.usd);
      if (p) return p;
    } catch {
      // ignore
    }

    console.warn("⚠️ All ETH price sources failed. Using fallback.");
    return FALLBACK_ETH_PRICE;
  });
}

// CoinGecko token price endpoint supports multiple contract addresses (comma separated).
// 414/URL too long → chunk it.
const CG_TOKEN_ENDPOINT = "https://api.coingecko.com/api/v3/simple/token_price/ethereum?vs_currencies=usd&contract_addresses=";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ✅ Token prices：分批查询 + 缓存
export async function getTokenPrices(addresses: string[]): Promise<Record<string, number>> {
  if (!addresses?.length) return {};

  // 统一小写，避免 key 对不上
  const addrs = Array.from(new Set(addresses.map((a) => a.toLowerCase())));

  const cacheKey = `token-prices:${addrs.slice(0, 80).join(",")}:${addrs.length}`; // key 不要无限长
  return cached(cacheKey, 5 * 60 * 1000, async () => {
    const prices: Record<string, number> = {};

    // 每批 40 个，URL 不容易爆
    const groups = chunk(addrs, 40);

    // 顺序请求（稳定优先，避免并发把 CoinGecko 打挂）
    for (const g of groups) {
      const url = `${CG_TOKEN_ENDPOINT}${encodeURIComponent(g.join(","))}`;
      try {
        const res: any = await fetchJsonWithTimeout(url, {}, 4000);
        if (res && typeof res === "object") {
          for (const addr of g) {
            const p = toNum(res?.[addr]?.usd);
            if (p) prices[addr] = p;
          }
        }
      } catch (e) {
        // 单批失败不影响整体
        console.warn("⚠️ Token price batch failed.", e);
      }
    }

    return prices;
  });
}