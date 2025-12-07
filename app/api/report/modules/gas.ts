// gas.ts — WalletAudit v1.0
// 轻量版 Gas 统计（最近最多 50 笔主动交易）

import { fetchJsonWithTimeout } from "../utils/fetch";
import { formatUnits, hexToBigInt, safeFloat } from "../utils/hex";
import { GasModule } from "./types";
import { getEthPrice } from "./prices";

const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!;
const MAX_TX_FOR_GAS = 50;

interface RawTransfer {
  hash?: string;
  from?: string;
  metadata?: {
    blockTimestamp?: string;
  };
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
    const hashes = transfers
      .map((t) => t.hash)
      .filter((h): h is string => Boolean(h));

    // 仅用前 MAX_TX_FOR_GAS 笔做 Gas 统计
    return hashes.slice(0, MAX_TX_FOR_GAS);
  } catch {
    return [];
  }
}

// 获取单笔交易的 gas 使用量（单位：ETH）
async function fetchGasForTx(hash: string): Promise<number> {
  try {
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
    if (!receipt) return 0;

    const gasUsedHex = receipt.gasUsed as string | undefined;
    const effGasPriceHex = receipt.effectiveGasPrice as
      | string
      | undefined;
    const gasPriceHex = effGasPriceHex || (receipt.gasPrice as string | undefined);

    if (!gasUsedHex || !gasPriceHex) return 0;

    const gasUsed = hexToBigInt(gasUsedHex);
    const gasPrice = hexToBigInt(gasPriceHex);

    if (gasUsed === 0n || gasPrice === 0n) return 0;

    const gasWei = gasUsed * gasPrice;
    const gasEth = formatUnits(gasWei, 18);

    return safeFloat(gasEth, 0);
  } catch {
    return 0;
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
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

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
    };
  }

  const [ethPrice, gasList] = await Promise.all([
    getEthPrice(),
    mapWithConcurrency(hashes, 5, (h) => fetchGasForTx(h)),
  ]);

  const gasEntries = hashes
    .map((hash, idx) => ({
      hash,
      gasEth: safeFloat(gasList[idx], 0),
    }))
    .filter((x) => x.gasEth > 0);

  const totalGasEth = gasEntries.reduce(
    (sum, x) => sum + x.gasEth,
    0
  );
  const totalGasUsd = safeFloat(totalGasEth * ethPrice, 0);

  const topTxs = gasEntries
    .slice()
    .sort((a, b) => b.gasEth - a.gasEth)
    .slice(0, 3);

  return {
    txCount: hashes.length,
    totalGasEth,
    totalGasUsd,
    topTxs,
  };
}

// === 新增：给 route.ts 调用的标准导出名 ===
export async function getGasStats(address: string): Promise<GasModule> {
  return buildGasModule(address);
}