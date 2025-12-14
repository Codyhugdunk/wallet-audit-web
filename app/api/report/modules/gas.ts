// app/api/report/modules/gas.ts — WalletAudit v1.1
// 轻量版 Gas 统计（最近最多 50 笔主动交易）
//
// v1.1 增强：Top Gas 交易补充解析 “to” 地址标签：ContractName (0x...)
// 失败降级显示原始地址

import { fetchJsonWithTimeout } from "../utils/fetch";
import { formatUnits, hexToBigInt, safeFloat } from "../utils/hex";
import { GasModule } from "./types";
import { getEthPrice } from "./prices";
import { formatAddressWithLabel } from "../utils/etherscan";

const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!;
const MAX_TX_FOR_GAS = 50;

interface RawTransfer {
  hash?: string;
  from?: string;
}

// 获取最近最多 50 笔 fromAddress = address 的转账（只要 hash）
async function fetchRecentTxHashes(address: string): Promise<string[]> {
  try {
    const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "alchemy_getAssetTransfers",
        params: [
          {
            fromAddress: address,
            maxCount: "0x1f4", // 先拉 500
            category: ["external", "erc20", "internal", "erc721", "erc1155"],
            withMetadata: false,
          },
        ],
      }),
    });

    const transfers: RawTransfer[] = res?.result?.transfers ?? [];
    const hashes = transfers.map((t) => t.hash).filter((h): h is string => Boolean(h));

    // 仅用前 MAX_TX_FOR_GAS 笔做 Gas 统计
    return hashes.slice(0, MAX_TX_FOR_GAS);
  } catch {
    return [];
  }
}

async function fetchTxToAddress(hash: string): Promise<string | null> {
  try {
    const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "eth_getTransactionByHash",
        params: [hash],
      }),
    });

    const to = res?.result?.to;
    return typeof to === "string" && /^0x[a-fA-F0-9]{40}$/.test(to) ? to : null;
  } catch {
    return null;
  }
}

// 获取单笔交易的 gas 使用量（单位：ETH）
async function fetchGasForTx(hash: string): Promise<{ gasEth: number; to: string | null }> {
  try {
    // receipt 里拿 gasUsed & effectiveGasPrice
    const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "eth_getTransactionReceipt",
        params: [hash],
      }),
    });

    const receipt = res?.result;
    if (!receipt) return { gasEth: 0, to: null };

    const gasUsedHex = receipt.gasUsed as string | undefined;
    const effGasPriceHex = receipt.effectiveGasPrice as string | undefined;
    const gasPriceHex = effGasPriceHex || (receipt.gasPrice as string | undefined);

    if (!gasUsedHex || !gasPriceHex) return { gasEth: 0, to: null };

    const gasUsed = hexToBigInt(gasUsedHex);
    const gasPrice = hexToBigInt(gasPriceHex);

    if (gasUsed === 0n || gasPrice === 0n) return { gasEth: 0, to: null };

    const gasWei = gasUsed * gasPrice;
    const gasEth = safeFloat(formatUnits(gasWei, 18), 0);

    // “to” 需要另查交易对象（receipt 里不一定有）
    const to = await fetchTxToAddress(hash);

    return { gasEth, to };
  } catch {
    return { gasEth: 0, to: null };
  }
}

// 对 Promise 做简单并发控制（避免一次开太多 RPC）
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  }

  const workers = [];
  const workerCount = Math.min(limit, items.length);
  for (let i = 0; i < workerCount; i++) workers.push(worker());

  await Promise.all(workers);
  return results;
}

// -----------------------------
// 主构建函数
// -----------------------------
export async function buildGasModule(address: string): Promise<GasModule> {
  const hashes = await fetchRecentTxHashes(address);
  if (!hashes.length) {
    return {
      txCount: 0,
      totalGasEth: 0,
      totalGasUsd: 0,
      topTxs: [],
    } as GasModule;
  }

  const [ethPrice, gasList] = await Promise.all([
    getEthPrice(),
    mapWithConcurrency(hashes, 5, (h) => fetchGasForTx(h)),
  ]);

  const gasEntries = hashes
    .map((hash, idx) => ({
      hash,
      gasEth: safeFloat(gasList[idx]?.gasEth ?? 0, 0),
      to: gasList[idx]?.to ?? null,
    }))
    .filter((x) => x.gasEth > 0);

  const totalGasEth = gasEntries.reduce((sum, x) => sum + x.gasEth, 0);
  const totalGasUsd = safeFloat(totalGasEth * ethPrice, 0);

  // Top 3 by gasEth
  const topRaw = gasEntries
    .slice()
    .sort((a, b) => b.gasEth - a.gasEth)
    .slice(0, 3);

  // v1.1：补充 toDisplay = ContractName (0x...)
  const topTxs: any[] = await Promise.all(
    topRaw.map(async (t) => {
      const toDisplay = t.to ? await formatAddressWithLabel(t.to) : null;
      return {
        hash: t.hash,
        gasEth: t.gasEth,
        to: t.to,
        toDisplay: toDisplay || t.to || null,
      };
    })
  );

  return {
    txCount: hashes.length,
    totalGasEth,
    totalGasUsd,
    topTxs, // 向前兼容：hash/gasEth 仍在；新增 to/toDisplay 给你前端用
  } as GasModule;
}