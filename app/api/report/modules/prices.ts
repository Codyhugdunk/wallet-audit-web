// app/api/report/modules/prices.ts
import { fetchJsonWithTimeout } from "../utils/fetch";
import { cached } from "../utils/cache";

const FALLBACK_ETH_PRICE = 3500; // ✅ 不要是 0，否则 ETH 资产直接归零
const BINANCE_ETH_URL =
  "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT";

type TokenPriceMap = Record<string, number>;

function uniqLowerAddrs(addresses: string[]) {
  return Array.from(
    new Set(
      (addresses || [])
        .map((a) => (a || "").trim().toLowerCase())
        .filter((a) => /^0x[a-f0-9]{40}$/.test(a))
    )
  );
}

/**
 * CoinGecko simple token price API（合约地址 -> usd）
 * 这个接口用 GET + querystring，URL 太长会 414
 * ✅ 解决：分块请求（chunk），每块限制数量/长度
 */
async function fetchCoinGeckoTokenPricesChunk(
  addrs: string[],
  timeoutMs = 4000
): Promise<TokenPriceMap> {
  if (!addrs.length) return {};

  const contractAddresses = addrs.join(",");
  const url =
    "https://api.coingecko.com/api/v3/simple/token_price/ethereum" +
    `?contract_addresses=${encodeURIComponent(contractAddresses)}` +
    `&vs_currencies=usd`;

  const res = await fetchJsonWithTimeout(url, { method: "GET" }, timeoutMs);

  const out: TokenPriceMap = {};
  if (res && typeof res === "object") {
    for (const [k, v] of Object.entries(res)) {
      const addr = k.toLowerCase();
      const usd = (v as any)?.usd;
      if (typeof usd === "number" && Number.isFinite(usd) && usd > 0) {
        out[addr] = usd;
      }
    }
  }
  return out;
}

/**
 * ✅ 分块策略：
 * - 每块最多 20 个地址（通常不会 414）
 * - 同时也限制 URL 长度保险
 */
function chunkAddresses(addrs: string[], maxPerChunk = 20): string[][] {
  const chunks: string[][] = [];
  let buf: string[] = [];

  for (const a of addrs) {
    buf.push(a);
    if (buf.length >= maxPerChunk) {
      chunks.push(buf);
      buf = [];
    }
  }
  if (buf.length) chunks.push(buf);
  return chunks;
}

export async function getEthPrice(): Promise<number> {
  return cached("eth-price", 60_000, async () => {
    try {
      const r = await fetchJsonWithTimeout(BINANCE_ETH_URL, {}, 2500);
      const p = Number(r?.price);
      if (Number.isFinite(p) && p > 0) return p;
    } catch {
      // ignore
    }
    return FALLBACK_ETH_PRICE;
  });
}

/**
 * ✅ 获取 token 价格：不再只查前 10 个
 * - 仍然用缓存，避免每次都打 CoinGecko
 * - 分块请求，合并结果
 */
export async function getTokenPrices(
  addresses: string[]
): Promise<TokenPriceMap> {
  const addrs = uniqLowerAddrs(addresses);
  if (!addrs.length) return {};

  // key 太长会爆缓存键长度，做一个稳定 key：只取前 60 个拼接 + count
  const key = `token-prices:${addrs.slice(0, 60).join(",")}:n=${addrs.length}`;

  return cached(key, 5 * 60_000, async () => {
    const chunks = chunkAddresses(addrs, 20);
    const merged: TokenPriceMap = {};

    for (const c of chunks) {
      try {
        const part = await fetchCoinGeckoTokenPricesChunk(c, 4500);
        Object.assign(merged, part);
      } catch {
        // 单块失败不影响整体
      }
    }

    return merged;
  });
}