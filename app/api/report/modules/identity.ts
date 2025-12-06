// identity.ts — WalletAudit v1.0
// 钱包身份识别：EOA / 合约 / 创建时间

import { fetchJsonWithTimeout } from "../utils/fetch";
import { IdentityInfo } from "./types";

const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!;

// 判断是否为合约地址
async function isContractAddress(address: string): Promise<boolean> {
  try {
    const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "eth_getCode",
        params: [address, "latest"],
      }),
    });

    if (!res || typeof res.result !== "string") return false;
    return res.result !== "0x";
  } catch {
    return false;
  }
}

// 获取钱包创建时间 —— 来自最近 500 笔交易的最早时间
async function getWalletCreatedAt(address: string): Promise<number | null> {
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
            maxCount: "0x1f4", // 500 笔
            category: ["external", "erc20", "internal", "erc721", "erc1155"],
            withMetadata: true,
          },
        ],
      }),
    });

    if (!res?.result?.transfers?.length) return null;

    const transfers = res.result.transfers;
    const earliest = transfers.reduce((min: any, t: any) => {
      if (!t.metadata?.blockTimestamp) return min;
      const ts = new Date(t.metadata.blockTimestamp).getTime();
      return Math.min(min, ts);
    }, Infinity);

    return earliest === Infinity ? null : earliest;
  } catch {
    return null;
  }
}

// -----------------------------
// 主导出函数
// -----------------------------
export async function buildIdentityModule(
  address: string
): Promise<IdentityInfo> {
  const [contract, createdAt] = await Promise.all([
    isContractAddress(address),
    getWalletCreatedAt(address),
  ]);

  return {
    address,
    isContract: contract,
    createdAt,
  };
}