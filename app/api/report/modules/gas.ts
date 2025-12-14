// app/api/report/modules/gas.ts
// 轻量版 Gas 统计（最近最多 50 笔主动交易）

import { fetchJsonWithTimeout } from "../utils/fetch";
import { formatUnits, hexToBigInt, safeFloat } from "../utils/hex";
import { GasModule } from "./types";
import { getEthPrice } from "./prices";
import { getDisplayName } from "./labels";

const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!;
const MAX_TX_FOR_GAS = 50;

interface RawTransfer {
  hash?: string;
}

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
            maxCount: "0x1f4",
            category: ["external", "erc20", "internal", "erc721", "erc1155"],
            withMetadata: false,
          },
        ],
      }),
    });

    const transfers: RawTransfer[] = res?.result?.transfers ?? [];
    const hashes = transfers.map((t) => t.hash).filter((h): h is string => Boolean(h));
    return hashes.slice(0, MAX_TX_FOR_GAS);
  } catch {
    return [];
  }
}

async function fetchReceipt(hash: string): Promise<any | null> {
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
    return res?.result ?? null;
  } catch {
    return null;
  }
}

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

export async function buildGasModule(address: string): Promise<GasModule> {
  const hashes = await fetchRecentTxHashes(address);
  if (!hashes.length) {
    return { txCount: 0, totalGasEth: 0, totalGasUsd: 0, topTxs: [] };
  }

  const [ethPrice, receipts] = await Promise.all([
    getEthPrice(),
    mapWithConcurrency(hashes, 5, (h) => fetchReceipt(h)),
  ]);

  const entries = await Promise.all(
    hashes.map(async (hash, idx) => {
      const receipt = receipts[idx];
      if (!receipt) return null;

      const gasUsedHex = receipt.gasUsed as string | undefined;
      const effGasPriceHex = receipt.effectiveGasPrice as string | undefined;
      const gasPriceHex = effGasPriceHex || (receipt.gasPrice as string | undefined);

      if (!gasUsedHex || !gasPriceHex) return null;

      const gasUsed = hexToBigInt(gasUsedHex);
      const gasPrice = hexToBigInt(gasPriceHex);
      if (gasUsed === 0n || gasPrice === 0n) return null;

      const gasWei = gasUsed * gasPrice;
      const gasEth = safeFloat(formatUnits(gasWei, 18), 0);
      if (gasEth <= 0) return null;

      const to = (receipt.to as string | undefined) || "";
      const toDisplay = to ? await getDisplayName(to) : "";

      return { hash, gasEth, to, toDisplay };
    })
  );

  const gasEntries = entries.filter(Boolean) as Array<{
    hash: string;
    gasEth: number;
    to: string;
    toDisplay: string;
  }>;

  const totalGasEth = gasEntries.reduce((sum, x) => sum + x.gasEth, 0);
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