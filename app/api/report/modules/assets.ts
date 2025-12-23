// app/api/report/modules/assets.ts
// v4.0 - Sequential Safe Mode (ETH First, Tokens Later)

import { fetchJsonWithTimeout } from "../utils/fetch";
import { formatUnits, hexToBigInt, safeFloat } from "../utils/hex";
import { cached } from "../utils/cache";
import { getEthPrice, getTokenPrices } from "./prices";
import { AssetModule, TokenBalance } from "./types";

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

// 1. 获取 ETH 余额 (独立函数，高优先级)
async function getEthBalance(address: string): Promise<number> {
  try {
    const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
      method: "POST", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "eth_getBalance", params: [address, "latest"] }),
    }, 5000); // 给足 5秒
    if (!res?.result) return 0;
    return formatUnits(hexToBigInt(res.result), 18);
  } catch (e) {
    console.error("ETH Balance fetch failed:", e);
    return 0; 
  }
}

interface RawTokenBalance { contractAddress: string; tokenBalance: string; }

// 2. 获取代币余额 (独立函数，带熔断)
async function getRawTokenBalancesSafe(address: string): Promise<RawTokenBalance[]> {
  try {
    // 强制 2.5 秒超时，如果 Alchemy 查太久直接放弃
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    
    const res = await fetch(ALCHEMY_RPC, {
      method: "POST", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "alchemy_getTokenBalances", params: [address, "erc20"] }),
      signal: controller.signal
    }).then(r => r.json());
    
    clearTimeout(timeoutId);
    
    // 过滤掉余额为 0 的
    return res?.result?.tokenBalances?.filter((t: any) => t?.tokenBalance && t?.tokenBalance !== "0x0") ?? [];
  } catch (e) {
    console.warn("⚠️ Token fetch skipped (Time limit or Error).");
    return []; // 返回空数组，不报错
  }
}

interface TokenMeta { symbol: string; decimals: number; }
async function fetchTokenMeta(contractAddress: string): Promise<TokenMeta> {
  const key = `token-meta:${contractAddress.toLowerCase()}`;
  return cached(key, 60 * 60 * 24 * 7 * 1000, async () => {
    try {
      const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "alchemy_getTokenMetadata", params: [contractAddress] }),
      }, 1000); // 元数据查询 1秒超时
      return { symbol: (res?.result?.symbol as string) || "UNKNOWN", decimals: typeof res?.result?.decimals === "number" ? res.result.decimals : 18 };
    } catch { return { symbol: "UNKNOWN", decimals: 18 }; }
  });
}

export async function buildAssetsModule(address: string): Promise<AssetModule> {
  // Step 1: 先搞定 ETH (这是必须成功的)
  // 我们串行执行，确保 ETH 拿到手再说
  const ethPrice = await getEthPrice();
  const ethAmount = await getEthBalance(address);
  
  // 此时我们已经有了最低保障：ETH 的价值
  const ethValue = safeFloat(ethAmount * ethPrice, 0);

  // 默认返回结构 (只有 ETH)
  const fallbackResult: AssetModule = {
      eth: { amount: ethAmount, value: ethValue },
      tokens: [],
      totalValue: ethValue,
      allocation: ethValue > 0 ? [{ category: "ETH", value: ethValue, ratio: 1 }] : [],
      otherTokens: [],
      priceWarning: null
  };

  // Step 2: 尝试搞取代币 (Try-Catch 包裹，失败就返回 Step 1 的结果)
  try {
      const allRawTokens = await getRawTokenBalancesSafe(address);

      // 如果没拿到代币，或者超时返回了空数组，直接返回 ETH 数据
      if (allRawTokens.length === 0) {
          return fallbackResult;
      }

      // Step 3: 只处理前 30 个大额代币 (进一步缩减规模，保平安)
      const topTokens = allRawTokens
        .sort((a, b) => b.tokenBalance.length - a.tokenBalance.length || (b.tokenBalance > a.tokenBalance ? 1 : -1))
        .slice(0, 30);

      const tokenAddresses = topTokens.map((t) => t.contractAddress);
      const uniqueAddresses = Array.from(new Set(tokenAddresses.map((a) => a.toLowerCase())));

      // 并行查价格和详情
      const [tokenPrices, metas] = await Promise.all([
        getTokenPrices(uniqueAddresses),
        Promise.all(uniqueAddresses.map((addr) => fetchTokenMeta(addr))),
      ]);

      const metaMap: Record<string, TokenMeta> = {};
      uniqueAddresses.forEach((addr, idx) => { metaMap[addr] = metas[idx]; });

      // 组装
      const tokens: TokenBalance[] = topTokens.map((t) => {
        const addr = t.contractAddress.toLowerCase();
        const meta = metaMap[addr] || { symbol: "UNKNOWN", decimals: 18 };
        const amount = formatUnits(hexToBigInt(t.tokenBalance), meta.decimals);
        const price = tokenPrices[addr] ?? 0;
        const value = safeFloat(amount * price, 0);
        return { contractAddress: addr, symbol: meta.symbol, amount, value, decimals: meta.decimals, hasPrice: price > 0 };
      });

      tokens.sort((a, b) => b.value - a.value);
      const tokensValue = tokens.reduce((sum, t) => sum + t.value, 0);
      const totalValue = safeFloat(ethValue + tokensValue, 0);

      const acc: { [cat: string]: number } = { "ETH": 0, "Stablecoins": 0, "Majors": 0, "Meme": 0, "Others": 0 };
      if (ethValue > 0) acc["ETH"] = ethValue;
      for (const t of tokens) { acc[classifyToken(t.symbol)] = (acc[classifyToken(t.symbol)] || 0) + t.value; }

      const allocation = Object.entries(acc)
        .filter(([_, val]) => val > 0)
        .map(([category, value]) => ({ category, value, ratio: totalValue > 0 ? value / totalValue : 0 })).sort((a, b) => b.value - a.value);

      const otherTokens = tokens.filter((t) => !t.hasPrice || t.value < 5);

      return { 
          eth: { amount: ethAmount, value: ethValue }, 
          tokens, 
          totalValue, 
          allocation, 
          otherTokens, 
          priceWarning: null 
      };

  } catch (error) {
      console.error("Critical Token Error, falling back to ETH only:", error);
      return fallbackResult; // 只要出错，立马返回 ETH 数据，保底不为 0
  }
}

export async function getAssets(address: string): Promise<AssetModule> {
  return buildAssetsModule(address);
}