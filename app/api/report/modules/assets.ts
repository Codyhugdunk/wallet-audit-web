// app/api/report/modules/assets.ts
// v5.0 - Targeted Strike Mode (ETH -> All Tokens -> VIP Tokens)

import { fetchJsonWithTimeout } from "../utils/fetch";
import { formatUnits, hexToBigInt, safeFloat } from "../utils/hex";
import { cached } from "../utils/cache";
import { getEthPrice, getTokenPrices } from "./prices";
import { AssetModule, TokenBalance } from "./types";
import { getEthBalanceWithFallback } from "../../../utils/rpc"; 

const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!;

const STABLE_SYMBOLS = new Set(["USDT", "USDC", "DAI", "FDUSD"]);
const MAJOR_SYMBOLS = new Set(["WETH", "WBTC", "TRUMP", "TROG", "MAGA", "SHIB", "PEPE", "LINK", "UNI"]);
const MEME_KEYWORDS = ["PEPE", "DOGE", "SHIB", "FLOKI", "BONK", "WIF", "MOG", "TRUMP"];

// 🎯 VIP 代币合约列表 (如果全量扫描挂了，就只查这些)
const VIP_TOKENS: Record<string, {symbol: string, decimal: number}> = {
    "0x576e2bed8f7b46d34016198911cdf9886f78bea7": { symbol: "TRUMP", decimal: 18 }, // 特朗普核心资产
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": { symbol: "WETH", decimal: 18 },  // 巨鲸通用
    "0xdac17f958d2ee523a2206206994597c13d831ec7": { symbol: "USDT", decimal: 6 },
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { symbol: "USDC", decimal: 6 },
    "0x6982508145454ce325ddbe47a25d4ec3d2311933": { symbol: "PEPE", decimal: 18 },
    "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce": { symbol: "SHIB", decimal: 18 },
};

function classifyToken(symbol: string): "Stablecoins" | "Majors" | "Meme" | "Others" {
  if (!symbol) return "Others";
  const sym = symbol.toUpperCase();
  if (STABLE_SYMBOLS.has(sym)) return "Stablecoins";
  if (MAJOR_SYMBOLS.has(sym)) return "Majors";
  for (const key of MEME_KEYWORDS) { if (sym.includes(key)) return "Meme"; }
  return "Others";
}

interface RawTokenBalance { contractAddress: string; tokenBalance: string; }

// 1. 全量扫描 (容易超时)
async function getRawTokenBalancesSafe(address: string): Promise<RawTokenBalance[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2秒熔断
    
    const res = await fetch(ALCHEMY_RPC, {
      method: "POST", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "alchemy_getTokenBalances", params: [address, "erc20"] }),
      signal: controller.signal
    }).then(r => r.json());
    
    clearTimeout(timeoutId);
    return res?.result?.tokenBalances?.filter((t: any) => t?.tokenBalance && t?.tokenBalance !== "0x0") ?? [];
  } catch (e) {
    return []; // 失败返回空
  }
}

// 2. 定点查询 VIP 代币 (保命神技)
async function getVipTokenBalances(address: string): Promise<TokenBalance[]> {
    const results: TokenBalance[] = [];
    const targets = Object.keys(VIP_TOKENS);
    
    // 构造批量请求
    const batchBody = targets.map((contract, idx) => ({
        id: idx,
        jsonrpc: "2.0",
        method: "eth_call",
        params: [{
            to: contract,
            data: "0x70a08231000000000000000000000000" + address.replace("0x", "") // balanceOf(address)
        }, "latest"]
    }));

    try {
        const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(batchBody)
        }, 3000);
        
        if (Array.isArray(res)) {
            for (let i = 0; i < res.length; i++) {
                const hex = res[i].result;
                if (hex && hex !== "0x" && hex !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
                    const contract = targets[i];
                    const meta = VIP_TOKENS[contract];
                    const amount = formatUnits(hexToBigInt(hex), meta.decimal);
                    if (amount > 0) {
                        results.push({
                            contractAddress: contract,
                            symbol: meta.symbol,
                            decimals: meta.decimal,
                            amount: amount,
                            value: 0, // 稍后算
                            hasPrice: true
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.error("VIP scan failed", e);
    }
    return results;
}

// 获取代币元数据 (通用)
interface TokenMeta { symbol: string; decimals: number; }
async function fetchTokenMeta(contractAddress: string): Promise<TokenMeta> {
  const key = `token-meta:${contractAddress.toLowerCase()}`;
  return cached(key, 60 * 60 * 24 * 30 * 1000, async () => {
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
  const [ethHex, ethPrice] = await Promise.all([
    getEthBalanceWithFallback(address),
    getEthPrice()
  ]);
  
  const ethAmount = formatUnits(hexToBigInt(ethHex), 18);
  const ethValue = safeFloat(ethAmount * ethPrice, 0);

  // 策略：先尝试全量，如果全量失败（空），则启动 VIP 定点扫描
  let tokens: TokenBalance[] = [];
  let usedVipScan = false;

  const rawTokens = await getRawTokenBalancesSafe(address);

  if (rawTokens.length > 0) {
      // 方案 A: 全量扫描成功
      const topTokens = rawTokens
        .sort((a, b) => b.tokenBalance.length - a.tokenBalance.length)
        .slice(0, 30);
      
      const addresses = topTokens.map(t => t.contractAddress);
      const uniqueAddrs = Array.from(new Set(addresses.map(a => a.toLowerCase())));
      
      const [tokenPrices, metas] = await Promise.all([
        getTokenPrices(uniqueAddrs),
        Promise.all(uniqueAddrs.map(addr => fetchTokenMeta(addr)))
      ]);
      
      const metaMap: Record<string, TokenMeta> = {};
      uniqueAddrs.forEach((addr, idx) => { metaMap[addr] = metas[idx]; });

      tokens = topTokens.map(t => {
          const addr = t.contractAddress.toLowerCase();
          const meta = metaMap[addr] || { symbol: "UNKNOWN", decimals: 18 };
          const amount = formatUnits(hexToBigInt(t.tokenBalance), meta.decimals);
          const price = tokenPrices[addr] ?? 0;
          return { contractAddress: addr, symbol: meta.symbol, amount, value: safeFloat(amount * price, 0), decimals: meta.decimals, hasPrice: price > 0 };
      });
  } else {
      // 方案 B: 全量超时，启动 VIP 扫描 (拯救特朗普)
      usedVipScan = true;
      tokens = await getVipTokenBalances(address);
      // 补价格
      const addrs = tokens.map(t => t.contractAddress);
      const prices = await getTokenPrices(addrs);
      tokens.forEach(t => {
          const p = prices[t.contractAddress.toLowerCase()] || 0;
          t.value = safeFloat(t.amount * p, 0);
          t.hasPrice = p > 0;
      });
  }

  tokens.sort((a, b) => b.value - a.value);
  const tokensValue = tokens.reduce((sum, t) => sum + t.value, 0);
  const totalValue = safeFloat(ethValue + tokensValue, 0);

  const acc: { [cat: string]: number } = { "ETH": 0, "Stablecoins": 0, "Majors": 0, "Meme": 0, "Others": 0 };
  if (ethValue > 0) acc["ETH"] = ethValue;
  for (const t of tokens) { acc[classifyToken(t.symbol)] = (acc[classifyToken(t.symbol)] || 0) + t.value; }

  const allocation = Object.entries(acc).filter(([_, val]) => val > 0).map(([category, value]) => ({ category, value, ratio: totalValue > 0 ? value / totalValue : 0 })).sort((a, b) => b.value - a.value);
  const otherTokens = tokens.filter((t) => !t.hasPrice || t.value < 5);

  return { 
      eth: { amount: ethAmount, value: ethValue }, 
      tokens, 
      totalValue, 
      allocation, 
      otherTokens, 
      // 如果用了 VIP 扫描，给个提示
      priceWarning: usedVipScan ? "Data traffic high. Showing major assets only." : null 
  };
}

export async function getAssets(address: string): Promise<AssetModule> {
  return buildAssetsModule(address);
}