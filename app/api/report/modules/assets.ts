// app/api/report/modules/assets.ts
// v3.2 - Fallback Strategy for Huge Wallets

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

// 基础 ETH 查询 (极快，绝不会挂)
async function getEthBalance(address: string): Promise<number> {
  try {
    const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "eth_getBalance", params: [address, "latest"] }),
    }, 2000); // 2秒超时
    return formatUnits(hexToBigInt(res?.result), 18);
  } catch { return 0; }
}

interface RawTokenBalance { contractAddress: string; tokenBalance: string; }

// 代币查询 (可能很慢，加上 try-catch 保护)
async function getRawTokenBalances(address: string): Promise<RawTokenBalance[]> {
  try {
    // 限制 4 秒超时，如果太慢直接放弃代币查询，保住 ETH
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    
    const res = await fetch(ALCHEMY_RPC, {
      method: "POST", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "alchemy_getTokenBalances", params: [address, "erc20"] }),
      signal: controller.signal
    }).then(r => r.json());
    
    clearTimeout(timeoutId);
    return res?.result?.tokenBalances?.filter((t: any) => t?.tokenBalance && t?.tokenBalance !== "0x0") ?? [];
  } catch (e) {
    console.warn("⚠️ Token fetch timed out, skipping tokens.");
    return []; // 超时返回空数组，而不是报错
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
      }, 1500); // 元数据查询也加紧超时
      return { symbol: (res?.result?.symbol as string) || "UNKNOWN", decimals: typeof res?.result?.decimals === "number" ? res.result.decimals : 18 };
    } catch { return { symbol: "UNKNOWN", decimals: 18 }; }
  });
}

export async function buildAssetsModule(address: string): Promise<AssetModule> {
  // 1. 先查 ETH 价格 (全剧通用)
  const ethPrice = await getEthPrice();

  // 2. 查 ETH 余额 (必须成功)
  const ethAmount = await getEthBalance(address);

  // 3. 查代币 (允许失败)
  const allRawTokens = await getRawTokenBalances(address);

  // 如果代币查询失败或为空，直接返回 ETH 数据，避免 $0
  if (allRawTokens.length === 0) {
      const ethVal = safeFloat(ethAmount * ethPrice, 0);
      return {
          eth: { amount: ethAmount, value: ethVal },
          tokens: [],
          totalValue: ethVal,
          allocation: ethVal > 0 ? [{ category: "ETH", value: ethVal, ratio: 1 }] : [],
          otherTokens: [],
          priceWarning: "部分代币数据加载超时，仅显示 ETH 资产。"
      };
  }

  // ... (原本的 Top 50 逻辑，用于处理没超时的正常巨鲸) ...
  const topTokens = allRawTokens
    .sort((a, b) => b.tokenBalance.length - a.tokenBalance.length || (b.tokenBalance > a.tokenBalance ? 1 : -1))
    .slice(0, 50);

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
  const ethValue = safeFloat(ethAmount * ethPrice, 0);
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