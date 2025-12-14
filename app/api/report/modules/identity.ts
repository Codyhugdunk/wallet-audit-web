// app/api/report/modules/identity.ts
// ✅ v1.2 — Identity module (Fixed contract detection)

import { fetchJsonWithTimeout } from "../utils/fetch";
import { cached } from "../utils/cache";
import type { IdentityModule } from "./types";

const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!;

async function getIsContract(address: string): Promise<boolean> {
  const key = `is-contract:${address.toLowerCase()}`;
  // 缓存 10 分钟
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
      
      // 核心修正：只有当 bytecode 长度大于 2 (即不仅仅是 "0x") 时，才确实是合约
      // 普通钱包通常返回 "0x"，长度为 2
      return typeof code === "string" && code.length > 2;
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
    createdAt: null, // 后续版本可接入 Etherscan API 获取第一笔交易时间
  };
}

export default buildIdentityModule;