// app/api/report/modules/assets.ts
// WalletAudit Pro - Asset Logic v2.0
// 增强了代币识别能力，不再把热门 Meme 归类为“其他”

import { fetchJsonWithTimeout } from "../utils/fetch";
import { formatUnits, hexToBigInt, safeFloat } from "../utils/hex";
import { cached } from "../utils/cache";
import { getEthPrice, getTokenPrices } from "./prices";
import { AssetModule, TokenBalance } from "./types";

const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!;

// ==========================================
// 1. 增强的代币字典 (Smart Dictionary)
// ==========================================

// 稳定币 (Stablecoins)
const STABLE_SYMBOLS = new Set([
  "USDT", "USDC", "DAI", "USDE", "USDS", "FDUSD", "TUSD", "USDP", "BUSD",
  "FRAX", "LUSD", "GUSD", "PYUSD", "MIM", "ALUSD", "DOLA"
]);

// 主流蓝筹 (Majors: L1/L2/DeFi Bluechip)
const MAJOR_SYMBOLS = new Set([
  "WETH", "WBTC", "CBETH", "RETH", "STETH", "EZETH", // ETH LSD
  "UNI", "AAVE", "LDO", "LINK", "MKR", "COMP", "SNX", "CRV", "RPL", "FXS", // DeFi
  "ARB", "OP", "MATIC", "POL", "IMX", "MNT", "STRK", "ZK", // L2
  "RNDR", "FET", "WLD", "TAO", // AI
  "ENA", "PENDLE", "ONDO" // New DeFi
]);

// Meme 关键词匹配库 (比硬编码 Symbol 更智能)
const MEME_KEYWORDS = [
  "PEPE", "DOGE", "SHIB", "FLOKI", "BONK", "WIF", "MOG", "TURBO", 
  "SPX", "LADYS", "MEME", "TRUMP", "MAGA", "BOME", "SLERF", "NEIRO",
  "PENGU", "POPCAT", "BRETT", "HarryPotter", "SNEK"
];

// ==========================================
// 2. 核心辅助函数
// ==========================================

function classifyToken(symbol: string): "Stablecoins" | "Majors" | "Meme" | "Others" {
  if (!symbol) return "Others";
  const sym = symbol.toUpperCase();

  // 1. 精确匹配稳定币
  if (STABLE_SYMBOLS.has(sym)) return "Stablecoins";
  
  // 2. 精确匹配主流币
  if (MAJOR_SYMBOLS.has(sym)) return "Majors";

  // 3. 模糊匹配 Meme (只要包含关键词，如 PEPEcoin, BabyDoge 都算)
  for (const key of MEME_KEYWORDS) {
    if (sym.includes(key)) return "Meme";
  }

  return "Others";
}

// -----------------------------
// RPC 获取 ETH 余额
// -----------------------------
async function getEthBalance(address: string): Promise<number> {
  try {
    const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [address, "latest"],
      }),
    });

    const hex = res?.result as string | undefined;
    const bn = hexToBigInt(hex);
    return formatUnits(bn, 18);
  } catch {
    return 0;
  }
}

// -----------------------------
// RPC 获取 ERC20 余额
// -----------------------------
interface RawTokenBalance {
  contractAddress: string;
  tokenBalance: string;
}

async function getRawTokenBalances(
  address: string
): Promise<RawTokenBalance[]> {
  try {
    const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "alchemy_getTokenBalances",
        params: [address, "erc20"],
      }),
    });

    const balances: RawTokenBalance[] =
      res?.result?.tokenBalances?.filter(
        (t: any) => t?.tokenBalance && t?.tokenBalance !== "0x0"
      ) ?? [];

    return balances;
  } catch {
    return [];
  }
}

// -----------------------------
// Token Metadata
// -----------------------------
interface TokenMeta {
  symbol: string;
  decimals: number;
}

async function fetchTokenMeta(contractAddress: string): Promise<TokenMeta> {
  const key = `token-meta:${contractAddress.toLowerCase()}`;
  return cached(key, 60 * 60 * 24 * 7 * 1000, async () => { // 缓存 7 天
    try {
      const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "alchemy_getTokenMetadata",
          params: [contractAddress],
        }),
      });

      const symbol = (res?.result?.symbol as string | undefined) || "UNKNOWN";
      const decimals =
        typeof res?.result?.decimals === "number"
          ? res.result.decimals
          : 18;

      return { symbol, decimals };
    } catch {
      return { symbol: "UNKNOWN", decimals: 18 };
    }
  });
}

// ==========================================
// 3. 资产模块主逻辑
// ==========================================
export async function buildAssetsModule(
  address: string
): Promise<AssetModule> {
  // 并行获取：ETH余额、ERC20列表、ETH价格
  const [ethAmount, rawTokens, ethPrice] = await Promise.all([
    getEthBalance(address),
    getRawTokenBalances(address),
    getEthPrice(),
  ]);

  // 获取所有 Token 的 Metadata 和 价格
  const tokenAddresses = rawTokens.map((t) => t.contractAddress);
  const uniqueAddresses = Array.from(
    new Set(tokenAddresses.map((a) => a.toLowerCase()))
  );

  const [tokenPrices, metas] = await Promise.all([
    getTokenPrices(uniqueAddresses),
    Promise.all(uniqueAddresses.map((addr) => fetchTokenMeta(addr))),
  ]);

  const metaMap: Record<string, TokenMeta> = {};
  uniqueAddresses.forEach((addr, idx) => {
    metaMap[addr] = metas[idx];
  });

  // 处理每个 Token 的数据
  const tokens: TokenBalance[] = rawTokens.map((t) => {
    const addr = t.contractAddress.toLowerCase();
    const meta = metaMap[addr] || { symbol: "UNKNOWN", decimals: 18 };
    const amount = formatUnits(hexToBigInt(t.tokenBalance), meta.decimals);
    const price = tokenPrices[addr] ?? 0;
    const value = safeFloat(amount * price, 0);

    return {
      contractAddress: addr,
      symbol: meta.symbol,
      amount,
      value,
      decimals: meta.decimals,
      hasPrice: price > 0,
    };
  });

  // 排序：价值高的排前面
  tokens.sort((a, b) => b.value - a.value);

  // 计算总价值
  const ethValue = safeFloat(ethAmount * ethPrice, 0);
  // 只统计价值 > 0.01 美元的资产，避免显示太多 0.000001 的垃圾
  const tokensValue = tokens.reduce((sum, t) => sum + t.value, 0);
  const totalValue = safeFloat(ethValue + tokensValue, 0);

  // 资产分配统计
  type Acc = { [cat: string]: number };
  const acc: Acc = {
    "ETH": 0,
    "Stablecoins": 0,
    "Majors": 0,
    "Meme": 0,
    "Others": 0
  };

  if (ethValue > 0) acc["ETH"] = ethValue;

  for (const t of tokens) {
    // 垃圾币过滤：如果是 'UNKNOWN' 且没有价格，或者价值极低，虽然计入 token 列表但不一定计入主要分类权重（可视需求调整）
    const cat = classifyToken(t.symbol);
    acc[cat] = (acc[cat] || 0) + t.value;
  }

  const allocation = Object.entries(acc)
    .filter(([_, val]) => val > 0) // 只返回有余额的分类
    .map(([category, value]) => {
      const ratio = totalValue > 0 ? value / totalValue : 0;
      return { category, value, ratio };
    })
    .sort((a, b) => b.value - a.value); // 按占比排序

  // 长尾资产定义优化：价值 < 10U 且占比极低的，归为 OtherTokens（不一定显示在主列表）
  const otherTokens = tokens.filter(
    (t) => !t.hasPrice || t.value < 5
  );

  return {
    eth: { amount: ethAmount, value: ethValue },
    tokens,
    totalValue,
    allocation,
    otherTokens,
    priceWarning: null
  };
}

export async function getAssets(address: string): Promise<AssetModule> {
  return buildAssetsModule(address);
}