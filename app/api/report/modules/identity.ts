// app/api/report/modules/identity.ts
// ✅ v1.1 — Identity module (stable compile)

import { fetchJsonWithTimeout } from "../utils/fetch";
import { cached } from "../utils/cache";
import type { IdentityModule } from "./types";

const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!;

async function getIsContract(address: string): Promise<boolean> {
  const key = `is-contract:${address.toLowerCase()}`;
  return cached(key, 10 * 60 * 1000, async () => {
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

      const code = (res?.result as string | undefined) || "0x";
      return typeof code === "string" && code !== "0x";
    } catch {
      return false;
    }
  });
}

export async function buildIdentityModule(address: string): Promise<IdentityModule> {
  const isContract = await getIsContract(address);
  return {
    address: address.toLowerCase(),
    isContract,
    createdAt: null, // ✅ 先稳定；后续你要补“创建时间”再迭代
  };
}

// ✅ 兼容 default export（防止有人用不同 import 写法）
export default buildIdentityModule;