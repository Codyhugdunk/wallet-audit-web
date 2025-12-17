// app/api/report/modules/assets.ts
// v3.0 - Performance Optimized for Super Whales

import { fetchJsonWithTimeout } from "../utils/fetch";
import { formatUnits, hexToBigInt, safeFloat } from "../utils/hex";
import { cached } from "../utils/cache";
import { getEthPrice, getTokenPrices } from "./prices";
import { AssetModule, TokenBalance } from "./types";

const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!;

// ... (常量定义保持不变) ...
const STABLE_SYMBOLS = new Set(["USDT", "USDC", "DAI", "USDE", "USDS", "FDUSD", "TUSD", "USDP", "BUSD", "FRAX", "LUSD", "GUSD", "PYUSD", "MIM", "ALUSD", "DOLA"]);
const MAJOR_SYMBOLS = new Set(["WETH", "WBTC", "CBETH", "RETH", "STETH", "EZETH", "UNI", "AAVE", "LDO", "LINK", "MKR", "COMP", "SNX", "CRV", "RPL", "FXS", "ARB", "OP", "MATIC", "POL", "IMX", "MNT", "STRK", "ZK", "RNDR", "FET", "WLD", "TAO", "ENA", "PENDLE", "ONDO", "TRUMP", "TROG"]); // 加了 TRUMP
const MEME_KEYWORDS = ["PEPE", "DOGE", "SHIB", "FLOKI", "BONK", "WIF", "MOG", "TURBO", "SPX", "LADYS", "MEME", "TRUMP", "MAGA", "BOME", "SLERF", "NEIRO", "PENGU", "POPCAT", "BRETT", "HarryPotter", "SNEK"];

function classifyToken(symbol: string): "Stablecoins" | "Majors" | "Meme" | "Others" {
  if (!symbol) return "Others";
  const sym = symbol.toUpperCase();
  if (STABLE_SYMBOLS.has(sym)) return "Stablecoins";
  if (MAJOR_SYMBOLS.has(sym)) return "Majors";
  for (const key of MEME_KEYWORDS) { if (sym.includes(key)) return "Meme"; }
  return "Others";
}

async function getEthBalance(address: string): Promise<number> {
  try {
    const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "eth_getBalance", params: [address, "latest"] }),
    });
    return formatUnits(hexToBigInt(res?.result), 18);
  } catch { return 0; }
}

interface RawTokenBalance { contractAddress: string; tokenBalance: string; }

// 获取所有代币，但不做处理
async function getRawTokenBalances(address: string): Promise<RawTokenBalance[]> {
  try {
    const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "alchemy_getTokenBalances", params: [address, "erc20"] }),
    });
    return res?.result?.tokenBalances?.filter((t: any) => t?.tokenBalance && t?.tokenBalance !== "0x0") ?? [];
  } catch { return []; }
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
  // 1. 获取基础数据
  const [ethAmount, allRawTokens, ethPrice] = await Promise.all([
    getEthBalance(address),
    getRawTokenBalances(address),
    getEthPrice(),
  ]);

  // ✅ 核心优化：只处理“看起来有钱”的前 50 个代币
  // 逻辑：按 tokenBalance 的字符串长度排序（十六进制越长，数值通常越大）
  const topTokens = allRawTokens
    .sort((a, b) => b.tokenBalance.length - a.tokenBalance.length || (b.tokenBalance > a.tokenBalance ? 1 : -1))
    .slice(0, 50); // 只取前50，忽略剩下的几千个垃圾币

  // 2. 只有这 50 个才去查元数据和价格 (极大减少 API 调用)
  const tokenAddresses = topTokens.map((t) => t.contractAddress);
  const uniqueAddresses = Array.from(new Set(tokenAddresses.map((a) => a.toLowerCase())));

  const [tokenPrices, metas] = await Promise.all([
    getTokenPrices(uniqueAddresses),
    Promise.all(uniqueAddresses.map((addr) => fetchTokenMeta(addr))),
  ]);

  const metaMap: Record<string, TokenMeta> = {};
  uniqueAddresses.forEach((addr, idx) => { metaMap[addr] = metas[idx]; });

  // 3. 组装数据
  const tokens: TokenBalance[] = topTokens.map((t) => {
    const addr = t.contractAddress.toLowerCase();
    const meta = metaMap[addr] || { symbol: "UNKNOWN", decimals: 18 };
    const amount = formatUnits(hexToBigInt(t.tokenBalance), meta.decimals);
    const price = tokenPrices[addr] ?? 0;
    const value = safeFloat(amount * price, 0);
    return { contractAddress: addr, symbol: meta.symbol, amount, value, decimals: meta.decimals, hasPrice: price > 0 };
  });

  // 再次排序：按真实美元价值
  tokens.sort((a, b) => b.value - a.value);

  const ethValue = safeFloat(ethAmount * ethPrice, 0);
  const tokensValue = tokens.reduce((sum, t) => sum + t.value, 0);
  const totalValue = safeFloat(ethValue + tokensValue, 0);

  const acc: { [cat: string]: number } = { "ETH": 0, "Stablecoins": 0, "Majors": 0, "Meme": 0, "Others": 0 };
  if (ethValue > 0) acc["ETH"] = ethValue;
  for (const t of tokens) { acc[classifyToken(t.symbol)] = (acc[classifyToken(t.symbol)] || 0) + t.value; }

  const allocation = Object.entries(acc)
    .filter(([_, val]) => val > 0)
    .map(([category, value]) => ({ category, value, ratio: totalValue > 0 ? value / totalValue : 0 }))
    .sort((a, b) => b.value - a.value);
    
  const otherTokens = tokens.filter((t) => !t.hasPrice || t.value < 5);

  return { eth: { amount: ethAmount, value: ethValue }, tokens, totalValue, allocation, otherTokens, priceWarning: null };
}

export async function getAssets(address: string): Promise<AssetModule> {
  return buildAssetsModule(address);
}