// app/api/report/modules/prices.ts
import { fetchJsonWithTimeout } from "../utils/fetch";
import { cached } from "../utils/cache";

// 最后的防线：万一全网断网，至少给个近似值，好过显示 $0
// 你可以每隔几个月更新一次这个值
const FALLBACK_ETH_PRICE = 3300; 

export async function getEthPrice(): Promise<number> {
  const key = "eth-price-usd";
  // 缓存 5 分钟
  return cached(key, 5 * 60 * 1000, async () => {
    
    // 1️⃣ 优先尝试 Binance API (速度极快，稳定性高)
    // 这是给“科学性”加的第一道保险
    try {
      const binanceRes = await fetchJsonWithTimeout(
        "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT",
        {},
        2000
      );
      if (binanceRes?.price) {
        return parseFloat(binanceRes.price);
      }
    } catch (e) {
      console.warn("Binance ETH price failed.");
    }

    // 2️⃣ 尝试 CoinGecko (数据全)
    try {
      const cgRes = await fetchJsonWithTimeout(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
        {},
        2000
      );
      if (cgRes?.ethereum?.usd) {
        return Number(cgRes.ethereum.usd);
      }
    } catch (e) {
      console.warn("CoinGecko ETH price failed.");
    }

    // 3️⃣ 实在不行，返回兜底价 (极低概率会走到这一步)
    console.error("All price APIs failed, using fallback.");
    return FALLBACK_ETH_PRICE;
  });
}

// 批量获取代币价格
export async function getTokenPrices(addresses: string[]): Promise<Record<string, number>> {
  if (!addresses.length) return {};
  
  // 只查前 15 个，防止 URL 过长报错
  const slice = addresses.slice(0, 15).join(",");
  const key = `token-prices-${slice}`;

  return cached(key, 10 * 60 * 1000, async () => {
    try {
      const url = `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${slice}&vs_currencies=usd`;
      const res = await fetchJsonWithTimeout(url, {}, 3000);
      
      const prices: Record<string, number> = {};
      if (res) {
        for (const addr of addresses) {
            const lower = addr.toLowerCase();
            if (res[lower]?.usd) {
                prices[lower] = res[lower].usd;
            }
        }
      }
      return prices;
    } catch (e) {
      return {}; 
    }
  });
}