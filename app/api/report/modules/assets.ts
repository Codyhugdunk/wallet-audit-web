// app/api/report/modules/assets.ts
// v3.4 - Stronger Fail-Safe: ETH Always, Tokens Retry, Missing-Price Warning

import { fetchJsonWithTimeout } from "../utils/fetch";
import { formatUnits, hexToBigInt, safeFloat } from "../utils/hex";
import { cached } from "../utils/cache";
import { getEthPrice, getTokenPrices } from "./prices";
import type { AssetModule, TokenBalance } from "./types";

const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!;
const MAX_TOKENS_TO_EVAL = 40;

// 分类
const STABLE_SYMBOLS = new Set(["USDT", "USDC", "DAI", "USDE", "USDS", "FDUSD", "TUSD", "USDP", "BUSD"]);
const MAJOR_SYMBOLS = new Set(["WETH", "WBTC", "CBETH", "RETH", "STETH", "EZETH", "UNI", "AAVE", "LDO", "LINK", "TRUMP", "TROG"]);
const MEME_KEYWORDS = ["PEPE", "DOGE", "SHIB", "FLOKI", "BONK", "WIF", "MOG", "TURBO", "SPX"];

function classifyToken(symbol: string): "Stablecoins" | "Majors" | "Meme" | "Others" {
  if (!symbol) return "Others";
  const sym = symbol.toUpperCase();
  if (STABLE_SYMBOLS.has(sym)) return "Stablecoins";
  if (MAJOR_SYMBOLS.has(sym)) return "Majors";
  for (const key of MEME_KEYWORDS) {
    if (sym.includes(key)) return "Meme";
  }
  return "Others";
}

// ETH 余额
async function getEthBalance(address: string): Promise<number> {
  try {
    const res = await fetchJsonWithTimeout(
      ALCHEMY_RPC,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "eth_getBalance",
          params: [address, "latest"],
        }),
      },
      8000
    );

    const weiHex = res?.result as string | undefined;
    if (!weiHex) return 0;
    return safeFloat(formatUnits(hexToBigInt(weiHex), 18), 0);
  } catch {
    return 0;
  }
}

interface RawTokenBalance {
  contractAddress: string;
  tokenBalance: string; // hex
}

// ✅ 代币余额：不再 2.5s 强制放弃；改为 8s 超时 + 失败重试一次 12s
async function getRawTokenBalancesWithRetry(address: string): Promise<RawTokenBalance[]> {
  const call = async (timeoutMs: number) => {
    const res = await fetchJsonWithTimeout(
      ALCHEMY_RPC,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "alchemy_getTokenBalances",
          params: [address, "erc20"],
        }),
      },
      timeoutMs
    );

    const list: any[] = res?.result?.tokenBalances ?? [];
    return list
      .filter((t) => t?.contractAddress && t?.tokenBalance && t.tokenBalance !== "0x0")
      .map((t) => ({ contractAddress: String(t.contractAddress), tokenBalance: String(t.tokenBalance) }));
  };

  try {
    return await call(8000);
  } catch (e1) {
    console.warn("⚠️ Token scan failed (try #1). Retrying...", e1);
    try {
      return await call(12000);
    } catch (e2) {
      console.warn("⚠️ Tokens skipped after retry.", e2);
      return [];
    }
  }
}

interface TokenMeta {
  symbol: string;
  decimals: number;
}

async function fetchTokenMeta(contractAddress: string): Promise<TokenMeta> {
  const key = `token-meta:${contractAddress.toLowerCase()}`;
  return cached(key, 60 * 60 * 24 * 7 * 1000, async () => {
    try {
      const res = await fetchJsonWithTimeout(
        ALCHEMY_RPC,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: 1,
            jsonrpc: "2.0",
            method: "alchemy_getTokenMetadata",
            params: [contractAddress],
          }),
        },
        8000
      );

      const symbol = (res?.result?.symbol as string) || "UNKNOWN";
      const decimals = typeof res?.result?.decimals === "number" ? res.result.decimals : 18;
      return { symbol, decimals };
    } catch {
      return { symbol: "UNKNOWN", decimals: 18 };
    }
  });
}

// ✅ 让“tokenBalance.length 排序”变成“按 bigint 真排序”
function sortByRawBalanceDesc(a: RawTokenBalance, b: RawTokenBalance): number {
  try {
    const av = hexToBigInt(a.tokenBalance);
    const bv = hexToBigInt(b.tokenBalance);
    if (av === bv) return 0;
    return bv > av ? 1 : -1;
  } catch {
    // 兜底：退化为字符串长度
    return b.tokenBalance.length - a.tokenBalance.length || (b.tokenBalance > a.tokenBalance ? 1 : -1);
  }
}

export async function buildAssetsModule(address: string): Promise<AssetModule> {
  // 1) ETH price + ETH balance 并行
  const [ethPrice, ethAmount] = await Promise.all([getEthPrice(), getEthBalance(address)]);
  const ethValue = safeFloat(ethAmount * ethPrice, 0);

  // 2) Tokens（允许失败）
  const allRawTokens = await getRawTokenBalancesWithRetry(address);

  // ✅ 如果 token 扫描失败/为空：仍然返回 ETH（并给 warning，方便 UI 做“价格缺失≠0”）
  if (allRawTokens.length === 0) {
    return {
      eth: { amount: ethAmount, value: ethValue },
      tokens: [],
      totalValue: ethValue,
      allocation: ethValue > 0 ? [{ category: "ETH", value: ethValue, ratio: 1 }] : [],
      otherTokens: [],
      priceWarning: "Token scan unavailable (timeout or RPC error). Showing ETH only.",
    };
  }

  // 3) 取前 N 个 token 做估值（避免极端钱包太慢）
  const topTokens = allRawTokens.sort(sortByRawBalanceDesc).slice(0, MAX_TOKENS_TO_EVAL);

  const tokenAddresses = topTokens.map((t) => t.contractAddress.toLowerCase());
  const uniqueAddresses = Array.from(new Set(tokenAddresses));

  const [tokenPrices, metas] = await Promise.all([
    getTokenPrices(uniqueAddresses),
    Promise.all(uniqueAddresses.map((addr) => fetchTokenMeta(addr))),
  ]);

  const metaMap: Record<string, TokenMeta> = {};
  uniqueAddresses.forEach((addr, idx) => {
    metaMap[addr] = metas[idx];
  });

  const tokens: TokenBalance[] = topTokens.map((t) => {
    const addr = t.contractAddress.toLowerCase();
    const meta = metaMap[addr] || { symbol: "UNKNOWN", decimals: 18 };

    const amount = safeFloat(formatUnits(hexToBigInt(t.tokenBalance), meta.decimals), 0);

    const price = tokenPrices[addr];
    const hasPrice = typeof price === "number" && price > 0;

    const value = hasPrice ? safeFloat(amount * price!, 0) : 0;

    return {
      contractAddress: addr,
      symbol: meta.symbol,
      amount,
      value,
      decimals: meta.decimals,
      hasPrice,
    };
  });

  tokens.sort((a, b) => b.value - a.value);

  const tokensValue = tokens.reduce((sum, t) => sum + t.value, 0);
  const totalValue = safeFloat(ethValue + tokensValue, 0);

  // allocation
  const acc: Record<string, number> = { ETH: 0, Stablecoins: 0, Majors: 0, Meme: 0, Others: 0 };
  if (ethValue > 0) acc.ETH = ethValue;
  for (const t of tokens) {
    const cat = classifyToken(t.symbol);
    acc[cat] = (acc[cat] || 0) + t.value;
  }

  const allocation = Object.entries(acc)
    .filter(([_, val]) => val > 0)
    .map(([category, value]) => ({
      category,
      value,
      ratio: totalValue > 0 ? value / totalValue : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // missing price warning
  const missingCount = tokens.filter((t) => !t.hasPrice).length;
  const priceWarning =
    missingCount > 0
      ? `Missing prices for ${missingCount} token(s). Their value is not included in total.`
      : null;

  const otherTokens = tokens.filter((t) => !t.hasPrice || t.value < 5);

  return {
    eth: { amount: ethAmount, value: ethValue },
    tokens,
    totalValue,
    allocation,
    otherTokens,
    priceWarning,
  };
}

export async function getAssets(address: string): Promise<AssetModule> {
  return buildAssetsModule(address);
}