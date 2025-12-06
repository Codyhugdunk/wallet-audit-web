// prices.ts — WalletAudit v1.0
// ETH / Token 价格模块（本地 fallback + 线上真实）
// 依赖：COINGECKO_DEMO_API_KEY（线上），本地使用 fallback

import { fetchJsonWithTimeout, isLocal } from "../utils/fetch";
import { cached } from "../utils/cache";

const COINGECKO_API_KEY = process.env.COINGECKO_DEMO_API_KEY;
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

// 本地固定 fallback ETH 价格
const LOCAL_ETH_FALLBACK = 2600;

// -----------------------------
// ETH 价格
// -----------------------------
export async function getEthPrice(): Promise<number> {
  // 本地直接返回 fallback，避免被墙
  if (isLocal || !COINGECKO_API_KEY) {
    return LOCAL_ETH_FALLBACK;
  }

  return cached("price:eth", 60_000, async () => {
    const url = `${COINGECKO_BASE}/simple/price?ids=ethereum&vs_currencies=usd&x_cg_demo_api_key=${COINGECKO_API_KEY}`;

    const data = await fetchJsonWithTimeout(url);
    const price = data?.ethereum?.usd;
    if (!price || !Number.isFinite(price)) {
      return LOCAL_ETH_FALLBACK;
    }
    return Number(price);
  });
}

// -----------------------------
// Token 价格（按合约地址）
// 输入：["0xToken1", "0xToken2", ...]
// 输出：{ "0xToken1": 1.23, "0xToken2": 0.01, ... }
// -----------------------------
export async function getTokenPrices(
  addresses: string[]
): Promise<Record<string, number>> {
  if (!addresses.length) return {};

  // 本地环境：全部没有价格（资产模块会根据 hasPrice=false 处理）
  if (isLocal || !COINGECKO_API_KEY) {
    const result: Record<string, number> = {};
    for (const addr of addresses) {
      result[addr.toLowerCase()] = 0;
    }
    return result;
  }

  // 线上：调用 CoinGecko token_price 接口
  // 注意长度限制，简单分批（每批最多 100 个）
  const batches: string[][] = [];
  const normalized = Array.from(
    new Set(addresses.map((a) => a.toLowerCase()))
  );

  const BATCH_SIZE = 100;
  for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
    batches.push(normalized.slice(i, i + BATCH_SIZE));
  }

  const allResults: Record<string, number> = {};

  await Promise.all(
    batches.map(async (batch, index) => {
      const key = `price:tokens:${index}:${batch.length}`;
      const batchResult = await cached(key, 60_000, async () => {
        const contracts = batch.join(",");
        const url = `${COINGECKO_BASE}/simple/token_price/ethereum?contract_addresses=${contracts}&vs_currencies=usd&x_cg_demo_api_key=${COINGECKO_API_KEY}`;

        const data = await fetchJsonWithTimeout(url);
        if (!data || typeof data !== "object") return {};

        const r: Record<string, number> = {};
        for (const [addr, info] of Object.entries<any>(data)) {
          const price = info?.usd;
          if (price && Number.isFinite(price)) {
            r[addr.toLowerCase()] = Number(price);
          }
        }
        return r;
      });

      Object.assign(allResults, batchResult);
    })
  );

  // 确保所有请求的地址都有 key（没有价格则 0）
  const filled: Record<string, number> = {};
  for (const addr of normalized) {
    filled[addr] = allResults[addr] ?? 0;
  }

  return filled;
}