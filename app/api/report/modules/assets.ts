// app/api/report/modules/assets.ts
// v5.1 - Native Alchemy Filtering (The Real Fix)

import { fetchJsonWithTimeout } from "../utils/fetch";
import { formatUnits, hexToBigInt, safeFloat } from "../utils/hex";
import { cached } from "../utils/cache";
import { getEthPrice, getTokenPrices } from "./prices";
import { AssetModule, TokenBalance } from "./types";
import { getEthBalanceWithFallback } from "../../../utils/rpc";

const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!;

const STABLE_SYMBOLS = new Set(["USDT", "USDC", "DAI", "FDUSD"]);
const MAJOR_SYMBOLS = new Set(["WETH", "WBTC", "TRUMP", "TROG", "MAGA", "SHIB", "PEPE", "LINK", "UNI"]);
const MEME_KEYWORDS = ["PEPE", "DOGE", "SHIB", "FLOKI", "BONK", "WIF", "MOG", "TURBO", "SPX"];

function classifyToken(symbol: string): "Stablecoins" | "Majors" | "Meme" | "Others" {
  if (!symbol) return "Others";
  const sym = symbol.toUpperCase();
  if (STABLE_SYMBOLS.has(sym)) return "Stablecoins";
  if (MAJOR_SYMBOLS.has(sym)) return "Majors";
  for (const key of MEME_KEYWORDS) { if (sym.includes(key)) return "Meme"; }
  return "Others";
}

// 🎯 精准制导列表：巨鲸常持有的高价值代币合约
// 包含：WETH, USDT, USDC, WBTC, SHIB, PEPE, TRUMP(MAGA), TROG, UNI, LINK
const TARGET_CONTRACTS = [
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
    "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
    "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
    "0x576e2bed8f7b46d34016198911cdf9886f78bea7", // TRUMP (MAGA) - 特朗普核心资产
    "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce", // SHIB
    "0x6982508145454ce325ddbe47a25d4ec3d2311933", // PEPE
    "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", // UNI
    "0x514910771af9ca656af840dff83e8264ecf986ca", // LINK
    "0xae7ab96520de3a18e5e111b5eaab095312d7fe84", // stETH
];

interface RawTokenBalance { contractAddress: string; tokenBalance: string; }

// 获取代币 (智能切换模式)
async function getRawTokenBalancesSmart(address: string): Promise<RawTokenBalance[]> {
  // 1. 尝试全量扫描 (Timeout 1.5s)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    
    const res = await fetch(ALCHEMY_RPC, {
      method: "POST", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
          id: 1, 
          jsonrpc: "2.0", 
          method: "alchemy_getTokenBalances", 
          params: [address, "erc20"] 
      }),
      signal: controller.signal
    }).then(r => r.json());
    
    clearTimeout(timeoutId);
    return res?.result?.tokenBalances?.filter((t: any) => t?.tokenBalance && t?.tokenBalance !== "0x0") ?? [];
  } catch (e) {
    // 2. 全量超时 -> 启动精准扫描 (Targeted Scan)
    // 这是 Alchemy 的原生功能，只查指定列表，速度极快，不会超时
    console.warn("⚠️ Full scan timed out, switching to Targeted Scan...");
    try {
        const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
            method: "POST", 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                id: 1, 
                jsonrpc: "2.0", 
                method: "alchemy_getTokenBalances", 
                params: [address, TARGET_CONTRACTS] // ✅ 传入白名单，只查这些
            }),
        });
        return res?.result?.tokenBalances?.filter((t: any) => t?.tokenBalance && t?.tokenBalance !== "0x0") ?? [];
    } catch (err) {
        console.error("Targeted scan failed", err);
        return [];
    }
  }
}

interface TokenMeta { symbol: string; decimals: number; }
async function fetchTokenMeta(contractAddress: string): Promise<TokenMeta> {
  const key = `token-meta:${contractAddress.toLowerCase()}`;
  return cached(key, 60 * 60 * 24 * 30 * 1000, async () => {
    try {
      const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "alchemy_getTokenMetadata", params: [contractAddress] }),
      }, 1500); 
      return { symbol: (res?.result?.symbol as string) || "UNKNOWN", decimals: typeof res?.result?.decimals === "number" ? res.result.decimals : 18 };
    } catch { return { symbol: "UNKNOWN", decimals: 18 }; }
  });
}

export async function buildAssetsModule(address: string): Promise<AssetModule> {
  // 1. 获取 ETH (保底)
  const [ethHex, ethPrice] = await Promise.all([
    getEthBalanceWithFallback(address),
    getEthPrice()
  ]);
  
  const ethAmount = formatUnits(hexToBigInt(ethHex), 18);
  const ethValue = safeFloat(ethAmount * ethPrice, 0);

  // 2. 获取代币 (智能模式)
  const rawTokens = await getRawTokenBalancesSmart(address);
  
  let tokens: TokenBalance[] = [];
  
  if (rawTokens.length > 0) {
      // 取前 40 个最大的
      const topTokens = rawTokens
        .sort((a, b) => b.tokenBalance.length - a.tokenBalance.length)
        .slice(0, 40);

      const uniqueAddresses = Array.from(new Set(topTokens.map(t => t.contractAddress.toLowerCase())));
      
      const [tokenPrices, metas] = await Promise.all([
        getTokenPrices(uniqueAddresses),
        Promise.all(uniqueAddresses.map(addr => fetchTokenMeta(addr)))
      ]);

      const metaMap: Record<string, TokenMeta> = {};
      uniqueAddresses.forEach((addr, idx) => { metaMap[addr] = metas[idx]; });

      tokens = topTokens.map(t => {
        const addr = t.contractAddress.toLowerCase();
        const meta = metaMap[addr] || { symbol: "UNKNOWN", decimals: 18 };
        const amount = formatUnits(hexToBigInt(t.tokenBalance), meta.decimals);
        const price = tokenPrices[addr] ?? 0;
        return { contractAddress: addr, symbol: meta.symbol, amount, value: safeFloat(amount * price, 0), decimals: meta.decimals, hasPrice: price > 0 };
      }).sort((a, b) => b.value - a.value);
  }

  const tokensValue = tokens.reduce((sum, t) => sum + t.value, 0);
  const totalValue = safeFloat(ethValue + tokensValue, 0);

  const acc: { [cat: string]: number } = { "ETH": 0, "Stablecoins": 0, "Majors": 0, "Meme": 0, "Others": 0 };
  if (ethValue > 0) acc["ETH"] = ethValue;
  for (const t of tokens) { acc[classifyToken(t.symbol)] = (acc[classifyToken(t.symbol)] || 0) + t.value; }

  const allocation = Object.entries(acc).filter(([_, val]) => val > 0).map(([category, value]) => ({ category, value, ratio: totalValue > 0 ? value / totalValue : 0 })).sort((a, b) => b.value - a.value);

  // 如果用了 Targeted Scan，且没查到东西，给个提示
  const priceWarning = (rawTokens.length === 0 && ethValue > 0) ? "Token scan limited due to wallet size." : null;

  return { 
      eth: { amount: ethAmount, value: ethValue }, 
      tokens, 
      totalValue, 
      allocation, 
      otherTokens: [], 
      priceWarning 
  };
}

export async function getAssets(address: string): Promise<AssetModule> {
  return buildAssetsModule(address);
}