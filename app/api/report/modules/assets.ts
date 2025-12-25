// app/api/report/modules/assets.ts
import { fetchJsonWithTimeout } from "../utils/fetch";
import { formatUnits, hexToBigInt, safeFloat } from "../utils/hex";
import { cached } from "../utils/cache";
import { getEthPrice, getTokenPrices } from "./prices";
import { AssetModule, TokenBalance } from "./types";
import { getEthBalanceWithFallback } from "../../../utils/rpc"; // ✅ 引入新工具

const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!;

const STABLE_SYMBOLS = new Set(["USDT", "USDC", "DAI", "USDE", "USDS", "FDUSD", "TUSD", "USDP", "BUSD"]);
const MAJOR_SYMBOLS = new Set(["WETH", "WBTC", "CBETH", "RETH", "STETH", "EZETH", "UNI", "AAVE", "LDO", "LINK", "TRUMP", "TROG", "MAGA"]);
const MEME_KEYWORDS = ["PEPE", "DOGE", "SHIB", "FLOKI", "BONK", "WIF", "MOG", "TURBO", "SPX"];

function classifyToken(symbol: string): "Stablecoins" | "Majors" | "Meme" | "Others" {
  if (!symbol) return "Others";
  const sym = symbol.toUpperCase();
  if (STABLE_SYMBOLS.has(sym)) return "Stablecoins";
  if (MAJOR_SYMBOLS.has(sym)) return "Majors";
  for (const key of MEME_KEYWORDS) { if (sym.includes(key)) return "Meme"; }
  return "Others";
}

interface RawTokenBalance { contractAddress: string; tokenBalance: string; }

// 查代币：必须加超强熔断
async function getRawTokenBalancesSafe(address: string): Promise<RawTokenBalance[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2秒必须返回，否则切断
    
    const res = await fetch(ALCHEMY_RPC, {
      method: "POST", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "alchemy_getTokenBalances", params: [address, "erc20"] }),
      signal: controller.signal
    }).then(r => r.json());
    
    clearTimeout(timeoutId);
    return res?.result?.tokenBalances?.filter((t: any) => t?.tokenBalance && t?.tokenBalance !== "0x0") ?? [];
  } catch (e) {
    console.error("Token scan aborted:", e);
    return []; // 失败返回空，保证不崩
  }
}

interface TokenMeta { symbol: string; decimals: number; }
async function fetchTokenMeta(contractAddress: string): Promise<TokenMeta> {
  const key = `token-meta:${contractAddress.toLowerCase()}`;
  return cached(key, 60 * 60 * 24 * 30 * 1000, async () => { // 缓存拉长到30天
    try {
      const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "alchemy_getTokenMetadata", params: [contractAddress] }),
      }, 1000);
      return { symbol: (res?.result?.symbol as string) || "UNKNOWN", decimals: typeof res?.result?.decimals === "number" ? res.result.decimals : 18 };
    } catch { return { symbol: "UNKNOWN", decimals: 18 }; }
  });
}

export async function buildAssetsModule(address: string): Promise<AssetModule> {
  // 1. 【核心修改】单独并行获取 ETH 基础数据
  // 即使后面代码全炸了，这两个数据也能保底
  const [ethHex, ethPrice] = await Promise.all([
    getEthBalanceWithFallback(address), // ✅ 使用多线路轮询，哪怕 Alchemy 挂了也能查到
    getEthPrice()
  ]);
  
  const ethAmount = formatUnits(hexToBigInt(ethHex), 18);
  const ethValue = safeFloat(ethAmount * ethPrice, 0);

  // 2. 尝试获取代币 (能获取多少是多少)
  let tokens: TokenBalance[] = [];
  try {
      const allRawTokens = await getRawTokenBalancesSafe(address);
      if (allRawTokens.length > 0) {
          // 只处理前 30 个最大的
          const topTokens = allRawTokens
            .sort((a, b) => b.tokenBalance.length - a.tokenBalance.length)
            .slice(0, 30);

          const uniqueAddresses = Array.from(new Set(topTokens.map(t => t.contractAddress.toLowerCase())));
          
          const [tokenPrices, metas] = await Promise.all([
            getTokenPrices(uniqueAddresses),
            Promise.all(uniqueAddresses.map(addr => fetchTokenMeta(addr)))
          ]);

          const metaMap: Record<string, TokenMeta> = {};
          uniqueAddresses.forEach((addr, idx) => { metaMap[addr] = metas[idx]; });

          tokens = topTokens.map((t) => {
            const addr = t.contractAddress.toLowerCase();
            const meta = metaMap[addr] || { symbol: "UNKNOWN", decimals: 18 };
            const amount = formatUnits(hexToBigInt(t.tokenBalance), meta.decimals);
            const price = tokenPrices[addr] ?? 0;
            const value = safeFloat(amount * price, 0);
            return { contractAddress: addr, symbol: meta.symbol, amount, value, decimals: meta.decimals, hasPrice: price > 0 };
          }).sort((a, b) => b.value - a.value);
      }
  } catch (e) {
      console.error("Token processing failed", e);
  }

  // 3. 汇总
  const tokensValue = tokens.reduce((sum, t) => sum + t.value, 0);
  const totalValue = safeFloat(ethValue + tokensValue, 0);

  const acc: { [cat: string]: number } = { "ETH": 0, "Stablecoins": 0, "Majors": 0, "Meme": 0, "Others": 0 };
  if (ethValue > 0) acc["ETH"] = ethValue;
  for (const t of tokens) { acc[classifyToken(t.symbol)] = (acc[classifyToken(t.symbol)] || 0) + t.value; }

  const allocation = Object.entries(acc).filter(([_, val]) => val > 0).map(([category, value]) => ({ category, value, ratio: totalValue > 0 ? value / totalValue : 0 })).sort((a, b) => b.value - a.value);
  const otherTokens = tokens.filter((t) => !t.hasPrice || t.value < 5);

  return { eth: { amount: ethAmount, value: ethValue }, tokens, totalValue, allocation, otherTokens, priceWarning: null };
}

export async function getAssets(address: string): Promise<AssetModule> {
  return buildAssetsModule(address);
}