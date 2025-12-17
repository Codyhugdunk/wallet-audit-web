// app/api/report/modules/assets.ts
// v3.3 - Fail-Safe Strategy: ETH First, Tokens Optional

import { fetchJsonWithTimeout } from "../utils/fetch";
import { formatUnits, hexToBigInt, safeFloat } from "../utils/hex";
import { cached } from "../utils/cache";
import { getEthPrice, getTokenPrices } from "./prices";
import { AssetModule, TokenBalance } from "./types";

const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!;

const STABLE_SYMBOLS = new Set(["USDT", "USDC", "DAI", "USDE", "USDS", "FDUSD", "TUSD", "USDP", "BUSD"]);
const MAJOR_SYMBOLS = new Set(["WETH", "WBTC", "CBETH", "RETH", "STETH", "EZETH", "UNI", "AAVE", "LDO", "LINK", "TRUMP", "TROG"]);
const MEME_KEYWORDS = ["PEPE", "DOGE", "SHIB", "FLOKI", "BONK", "WIF", "MOG", "TURBO", "SPX"];

function classifyToken(symbol: string): "Stablecoins" | "Majors" | "Meme" | "Others" {
  if (!symbol) return "Others";
  const sym = symbol.toUpperCase();
  if (STABLE_SYMBOLS.has(sym)) return "Stablecoins";
  if (MAJOR_SYMBOLS.has(sym)) return "Majors";
  for (const key of MEME_KEYWORDS) { if (sym.includes(key)) return "Meme"; }
  return "Others";
}

// 基础 ETH 查询
async function getEthBalance(address: string): Promise<number> {
  try {
    const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "eth_getBalance", params: [address, "latest"] }),
    }); // 移除过短的 timeout 参数，使用默认
    return formatUnits(hexToBigInt(res?.result), 18);
  } catch { return 0; }
}

interface RawTokenBalance { contractAddress: string; tokenBalance: string; }

// 代币查询：带 2秒 强制熔断
async function getRawTokenBalancesSafe(address: string): Promise<RawTokenBalance[]> {
  const fetchPromise = fetchJsonWithTimeout(ALCHEMY_RPC, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "alchemy_getTokenBalances", params: [address, "erc20"] }),
  });

  // 创建一个 2.5 秒后自动 reject 的 Promise
  const timeoutPromise = new Promise<RawTokenBalance[]>((_, reject) => 
      setTimeout(() => reject(new Error("Token scan timed out")), 2500)
  );

  try {
      // 谁快用谁，如果 2.5s 没跑完，直接走 catch
      const res: any = await Promise.race([fetchPromise, timeoutPromise]);
      return res?.result?.tokenBalances?.filter((t: any) => t?.tokenBalance && t?.tokenBalance !== "0x0") ?? [];
  } catch (e) {
      console.warn("⚠️ Tokens skipped due to timeout or error.");
      return []; // 返回空数组，不崩
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
      });
      return { symbol: (res?.result?.symbol as string) || "UNKNOWN", decimals: typeof res?.result?.decimals === "number" ? res.result.decimals : 18 };
    } catch { return { symbol: "UNKNOWN", decimals: 18 }; }
  });
}

export async function buildAssetsModule(address: string): Promise<AssetModule> {
  // 1. 并行获取 ETH 价格和 ETH 余额 (这俩很快，几乎必成功)
  const [ethPrice, ethAmount] = await Promise.all([
    getEthPrice(),
    getEthBalance(address)
  ]);

  // 计算 ETH 价值
  const ethValue = safeFloat(ethAmount * ethPrice, 0);

  // 2. 尝试获取代币 (可能会失败/超时)
  const allRawTokens = await getRawTokenBalancesSafe(address);

  // 如果代币获取失败，立刻返回 ETH 数据，绝不返回 0
  if (allRawTokens.length === 0) {
      return {
          eth: { amount: ethAmount, value: ethValue },
          tokens: [],
          totalValue: ethValue,
          allocation: ethValue > 0 ? [{ category: "ETH", value: ethValue, ratio: 1 }] : [],
          otherTokens: [],
          priceWarning: null
      };
  }

  // 3. 如果拿到了代币，只取前 40 个最大的进行解析
  const topTokens = allRawTokens
    .sort((a, b) => b.tokenBalance.length - a.tokenBalance.length || (b.tokenBalance > a.tokenBalance ? 1 : -1))
    .slice(0, 40);

  const tokenAddresses = topTokens.map((t) => t.contractAddress);
  const uniqueAddresses = Array.from(new Set(tokenAddresses.map((a) => a.toLowerCase())));

  const [tokenPrices, metas] = await Promise.all([
    getTokenPrices(uniqueAddresses),
    Promise.all(uniqueAddresses.map((addr) => fetchTokenMeta(addr))),
  ]);

  const metaMap: Record<string, TokenMeta> = {};
  uniqueAddresses.forEach((addr, idx) => { metaMap[addr] = metas[idx]; });

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

  const allocation = Object.entries(acc).filter(([_, val]) => val > 0).map(([category, value]) => ({ category, value, ratio: totalValue > 0 ? value / totalValue : 0 })).sort((a, b) => b.value - a.value);
  const otherTokens = tokens.filter((t) => !t.hasPrice || t.value < 5);

  return { eth: { amount: ethAmount, value: ethValue }, tokens, totalValue, allocation, otherTokens, priceWarning: null };
}

export async function getAssets(address: string): Promise<AssetModule> {
  return buildAssetsModule(address);
}