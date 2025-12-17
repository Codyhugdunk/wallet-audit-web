// app/api/report/modules/prices.ts
import { fetchJsonWithTimeout } from "../utils/fetch";
import { cached } from "../utils/cache";

// ✅ 最后的防线：如果所有 API 都挂了，就用这个大概的价格
// 防止页面出现 $0 这种低级错误
const FALLBACK_ETH_PRICE = 3900; 

export async function getEthPrice(): Promise<number> {
  const key = "eth-price-usd";
  // 缓存 5 分钟，避免频繁撞墙
  return cached(key, 5 * 60 * 1000, async () => {
    try {
      // 1️⃣ 优先尝试 CoinGecko
      const cgRes = await fetchJsonWithTimeout(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
        {},
        2000 // 2秒超时
      );
      if (cgRes?.ethereum?.usd) {
        return Number(cgRes.ethereum.usd);
      }
    } catch (e) {
      console.warn("CoinGecko ETH price failed, trying backup...");
    }

    try {
      // 2️⃣ 备用尝试 Binance API (公共接口)
      const binanceRes = await fetchJsonWithTimeout(
        "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT",
        {},
        2000
      );
      if (binanceRes?.price) {
        return Number(binanceRes.price);
      }
    } catch (e) {
      console.warn("Binance ETH price failed.");
    }

    // 3️⃣ 实在不行，返回兜底价
    console.error("All price APIs failed, using fallback.");
    return FALLBACK_ETH_PRICE;
  });
}

// 批量获取代币价格 (主要用于 Assets 列表)
export async function getTokenPrices(addresses: string[]): Promise<Record<string, number>> {
  if (!addresses.length) return {};
  
  // CoinGecko 免费版不支持太长的 URL，所以我们只取前 10 个重要的查一下
  // 避免 URL 过长导致 414 错误
  const slice = addresses.slice(0, 10).join(",");
  const key = `token-prices-${slice}`;

  return cached(key, 5 * 60 * 1000, async () => {
    try {
      // 注意：CoinGecko 查代币价格需要用 contract addresses
      // 免费版限制较多，这里尽力而为
      const url = `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${slice}&vs_currencies=usd`;
      
      const res = await fetchJsonWithTimeout(url, {}, 3000);
      
      const prices: Record<string, number> = {};
      if (res) {
        for (const addr of addresses) {
            // CoinGecko 返回的 key 也是小写的
            const lowerAddr = addr.toLowerCase();
            if (res[lowerAddr]?.usd) {
                prices[lowerAddr] = res[lowerAddr].usd;
            }
        }
      }
      return prices;
    } catch (e) {
      console.warn("Token prices fetch failed", e);
      return {}; // 失败返回空对象，不影响主流程
    }
  });
}