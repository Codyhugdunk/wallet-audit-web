// assets.ts — WalletAudit v1.0
// 资产模块：ETH + ERC20 + Token Metadata + 价格 + 分配结构

import { fetchJsonWithTimeout } from "../utils/fetch";
import { formatUnits, hexToBigInt, safeFloat } from "../utils/hex";
import { cached } from "../utils/cache";
import { getEthPrice, getTokenPrices } from "./prices";
import { AssetModule, TokenBalance } from "./types";

const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!;

// 一些简单的分类规则
const STABLE_SYMBOLS = new Set([
  "USDT",
  "USDC",
  "DAI",
  "USDE",
  "USDS",
  "FDUSD",
  "TUSD",
  "USDP",
  "BUSD",
]);

const MAJOR_SYMBOLS = new Set([
  "WETH",
  "WBTC",
  "UNI",
  "AAVE",
  "LDO",
  "LINK",
  "MKR",
]);

// -----------------------------
// ETH 余额
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
// ERC20 余额（alchemy_getTokenBalances）
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
// Token Metadata（symbol / decimals）
// -----------------------------
interface TokenMeta {
  symbol: string;
  decimals: number;
}

async function fetchTokenMeta(contractAddress: string): Promise<TokenMeta> {
  const key = `token-meta:${contractAddress.toLowerCase()}`;
  return cached(key, 10 * 60 * 1000, async () => {
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

// -----------------------------
// 分类：Stable / Major / Meme / Other
// -----------------------------
function classifyToken(symbol: string): "Stablecoins" | "Majors" | "Meme" | "Others" {
  const sym = symbol.toUpperCase();

  if (STABLE_SYMBOLS.has(sym)) return "Stablecoins";
  if (MAJOR_SYMBOLS.has(sym)) return "Majors";

  // 简单判断 Meme：包含 PEPE / DOGE / SHIB 等关键词
  if (sym.includes("PEPE") || sym.includes("DOGE") || sym.includes("SHIB")) {
    return "Meme";
  }

  return "Others";
}

// -----------------------------
// 构建资产模块主函数
// -----------------------------
export async function buildAssetsModule(
  address: string
): Promise<AssetModule> {
  // 1. 基础数据：ETH 余额 + ERC20 原始余额
  const [ethAmount, rawTokens, ethPrice] = await Promise.all([
    getEthBalance(address),
    getRawTokenBalances(address),
    getEthPrice(),
  ]);

  // 2. ERC20：获取 metadata + 数量
  const tokenAddresses = rawTokens.map((t) => t.contractAddress);
  const uniqueAddresses = Array.from(
    new Set(tokenAddresses.map((a) => a.toLowerCase()))
  );

  const [tokenPrices, metas] = await Promise.all([
    getTokenPrices(uniqueAddresses),
    Promise.all(
      uniqueAddresses.map((addr) => fetchTokenMeta(addr))
    ),
  ]);

  const metaMap: Record<string, TokenMeta> = {};
  uniqueAddresses.forEach((addr, idx) => {
    metaMap[addr] = metas[idx];
  });

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

  // 3. 计算总价值
  const ethValue = safeFloat(ethAmount * ethPrice, 0);
  const tokensValue = tokens.reduce((sum, t) => sum + t.value, 0);
  const totalValue = safeFloat(ethValue + tokensValue, 0);

  // 4. 资产分配（Allocation）
  type Acc = {
    [cat: string]: number;
  };

  const acc: Acc = {};

  // ETH 单独一类
  if (ethValue > 0) {
    acc["ETH"] = (acc["ETH"] || 0) + ethValue;
  }

  for (const t of tokens) {
    const cat = classifyToken(t.symbol);
    acc[cat] = (acc[cat] || 0) + t.value;
  }

  const allocation = Object.entries(acc).map(([category, value]) => {
    const ratio = totalValue > 0 ? value / totalValue : 0;
    return {
      category,
      value,
      ratio,
    };
  });

  // 5. 长尾资产（otherTokens）定义：
  // - 没有价格，或者
  // - 价值 < 1 美元的 Token
  const otherTokens = tokens.filter(
    (t) => !t.hasPrice || t.value < 1
  );

  // 6. 价格警告
  let priceWarning: string | null = null;
  const noPriceCount = tokens.filter((t) => !t.hasPrice).length;
  if (noPriceCount > 0) {
    priceWarning = `有 ${noPriceCount} 个代币缺少价格，实际总价值可能偏低。`;
  }

  return {
    eth: {
      amount: ethAmount,
      value: ethValue,
    },
    tokens,
    totalValue,
    allocation,
    otherTokens,
    priceWarning,
  };
}

// === 新增：给 route.ts 调用的标准导出名 ===
export async function getAssets(address: string): Promise<AssetModule> {
  return buildAssetsModule(address);
}