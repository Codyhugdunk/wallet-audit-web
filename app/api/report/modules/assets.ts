// app/api/report/modules/assets.ts
import { fetchJsonWithTimeout } from "../utils/fetch";
import { formatUnits, safeFloat } from "../utils/hex";
import { getEthPrice, getTokenPrices } from "./prices";
import type { AssetModule } from "./types";

const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!;

interface AlchemyTokenBalance {
  contractAddress: string;
  tokenBalance: string; // hex string
}

function isEthAddress(addr: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

async function alchemyGetTokenBalances(address: string) {
  const res = await fetchJsonWithTimeout(
    ALCHEMY_RPC,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "alchemy_getTokenBalances",
        params: [address],
      }),
    },
    6000
  );
  return (res?.result?.tokenBalances ?? []) as AlchemyTokenBalance[];
}

async function alchemyGetBalance(address: string) {
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
    6000
  );
  return (res?.result as string) || "0x0";
}

// 你项目里如果有 token metadata 获取函数，就用你已有的；这里给一个最稳 fallback
async function alchemyGetTokenMetadata(contractAddress: string) {
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
    6000
  );
  return res?.result ?? null;
}

export async function buildAssetsModule(address: string): Promise<AssetModule> {
  const addr = address.toLowerCase();
  if (!isEthAddress(addr)) {
    return {
      eth: { amount: 0, value: 0 },
      tokens: [],
      totalValue: 0,
      allocation: [],
      otherTokens: [],
      priceWarning: "",
    } as any;
  }

  const [ethPrice, ethBalHex, tokenBalances] = await Promise.all([
    getEthPrice(),
    alchemyGetBalance(addr),
    alchemyGetTokenBalances(addr),
  ]);

  // ETH
  const ethAmount = safeFloat(formatUnits(BigInt(ethBalHex), 18), 0);
  const ethValue = safeFloat(ethAmount * ethPrice, 0);

  // 过滤掉 0 余额
  const nonZero = tokenBalances
    .filter((t) => t?.contractAddress && t?.tokenBalance && t.tokenBalance !== "0x0")
    .map((t) => ({
      contractAddress: t.contractAddress.toLowerCase(),
      tokenBalanceHex: t.tokenBalance,
    }));

  // 拉 metadata（symbol/decimals）
  const metaList = await Promise.all(
    nonZero.map(async (t) => {
      try {
        const m = await alchemyGetTokenMetadata(t.contractAddress);
        const decimals =
          typeof m?.decimals === "number" ? m.decimals : 18;
        const symbol =
          typeof m?.symbol === "string" && m.symbol ? m.symbol : "UNKNOWN";
        return { ...t, decimals, symbol };
      } catch {
        return { ...t, decimals: 18, symbol: "UNKNOWN" };
      }
    })
  );

  // 拉价格（✅ 全量分块）
  const priceMap = await getTokenPrices(metaList.map((x) => x.contractAddress));

  const tokens = metaList.map((t) => {
    const amount = safeFloat(
      formatUnits(BigInt(t.tokenBalanceHex), t.decimals),
      0
    );

    const price = priceMap[t.contractAddress];
    const hasPrice = typeof price === "number" && price > 0;

    // ✅ value=0 不代表资产=0，只代表“未计入估值”
    const value = hasPrice ? safeFloat(amount * price, 0) : 0;

    return {
      contractAddress: t.contractAddress,
      symbol: t.symbol,
      amount,
      value,
      decimals: t.decimals,
      hasPrice,
    };
  });

  // ✅ totalValue：只统计可定价资产（ETH 永远可定价，因为我们有 fallback）
  const pricedTokenValue = tokens.reduce((s, x) => s + (x.hasPrice ? x.value : 0), 0);
  const totalValue = safeFloat(ethValue + pricedTokenValue, 0);

  // 统计缺价
  const unpriced = tokens.filter((t) => !t.hasPrice);
  const unpricedCount = unpriced.length;

  // allocation（按你原逻辑分类即可，这里保持一个最小可用）
  const allocation = [
    { category: "ETH", value: ethValue, ratio: totalValue > 0 ? ethValue / totalValue : 0 },
    { category: "Stablecoins", value: 0, ratio: 0 },
    { category: "Others", value: totalValue > 0 ? pricedTokenValue / totalValue * totalValue : pricedTokenValue, ratio: totalValue > 0 ? pricedTokenValue / totalValue : 0 },
    { category: "Meme", value: 0, ratio: 0 },
  ];

  const priceWarning =
    unpricedCount > 0
      ? `有 ${unpricedCount} 个代币缺少价格，估值仅统计可定价资产（并不代表这些代币为 0）。`
      : "";

  return {
    eth: { amount: ethAmount, value: ethValue },
    tokens,
    totalValue,
    allocation,
    otherTokens: unpriced,
    priceWarning,
    // ✅ 你 types.ts 里如果没字段可以先不加；若已加就打开下面
    // priceStats: { unpricedCount }
  } as any;
}