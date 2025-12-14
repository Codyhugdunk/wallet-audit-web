// app/api/report/modules/prices.ts
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
  // ✅ 只有本地才 fallback（线上必须走真实）
  if (isLocal) return LOCAL_ETH_FALLBACK;

  // 线上没有 key 也可以请求（只是更容易被限频）
  return cached("price:eth", 60_000, async () => {
    const url =
      `${COINGECKO_BASE}/simple/price?ids=ethereum&vs_currencies=usd` +
      (COINGECKO_API_KEY ? `&x_cg_demo_api_key=${COINGECKO_API_KEY}` : "");

    const data = await fetchJsonWithTimeout(url);
    const price = data?.ethereum?.usd;
    if (!price || !Number.isFinite(price)) return LOCAL_ETH_FALLBACK;
    return Number(price);
  });
}

// -----------------------------
// Token 价格（按合约地址）
// -----------------------------
export async function getTokenPrices(
  addresses: string[]
): Promise<Record<string, number>> {
  if (!addresses.length) return {};

  // ✅ 本地：全 0（你既定规则）
  if (isLocal) {
    const result: Record<string, number> = {};
    for (const addr of addresses) result[addr.toLowerCase()] = 0;
    return result;
  }

  // 线上：调用 token_price
  const normalized = Array.from(new Set(addresses.map((a) => a.toLowerCase())));

  const batches: string[][] = [];
  const BATCH_SIZE = 100;
  for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
    batches.push(normalized.slice(i, i + BATCH_SIZE));
  }

  const allResults: Record<string, number> = {};

  await Promise.all(
    batches.map(async (batch) => {
      const key = `price:tokens:${batch[0]}:${batch.length}`;
      const batchResult = await cached(key, 60_000, async () => {
        const contracts = batch.join(",");
        const url =
          `${COINGECKO_BASE}/simple/token_price/ethereum?contract_addresses=${contracts}&vs_currencies=usd` +
          (COINGECKO_API_KEY ? `&x_cg_demo_api_key=${COINGECKO_API_KEY}` : "");

        const data = await fetchJsonWithTimeout(url);
        if (!data || typeof data !== "object") return {};

        const r: Record<string, number> = {};
        for (const [addr, info] of Object.entries<any>(data)) {
          const price = info?.usd;
          if (price && Number.isFinite(price)) r[addr.toLowerCase()] = Number(price);
        }
        return r;
      });

      Object.assign(allResults, batchResult);
    })
  );

  const filled: Record<string, number> = {};
  for (const addr of normalized) filled[addr] = allResults[addr] ?? 0;
  return filled;
}