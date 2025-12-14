// app/api/report/utils/etherscan.ts
const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api";
const ETHEREUM_CHAIN_ID = 1;

/**
 * 轻量内存缓存：减少 Etherscan 请求次数，避免触发频率限制
 */
const memCache = new Map<string, { label: string | null; expireAt: number }>();

function isValidEthAddress(address: string): boolean {
  return typeof address === "string" && /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Etherscan V2：Get Contract Source Code for Verified Contract Source Codes
 * module=contract&action=getsourcecode
 *
 * 返回：
 * - string: ContractName
 * - null: 未验证/失败/限频/无标签
 */
export async function getContractLabel(address: string): Promise<string | null> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) return null;
  if (!isValidEthAddress(address)) return null;

  const addr = address.toLowerCase();

  // 成功 24h，失败 1h
  const now = Date.now();
  const hit = memCache.get(addr);
  if (hit && hit.expireAt > now) return hit.label;

  try {
    const url =
      `${ETHERSCAN_V2_BASE}?chainid=${ETHEREUM_CHAIN_ID}` +
      `&module=contract&action=getsourcecode&address=${addr}&apikey=${apiKey}`;

    const res = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      memCache.set(addr, { label: null, expireAt: now + 60 * 60 * 1000 });
      return null;
    }

    const data: any = await res.json();

    // ✅ 兼容 Etherscan 的返回结构：
    // { status: "1", message: "OK", result: [ { ContractName: "xxx" } ] }
    // 或 { status: "0", message: "NOTOK", result: "..." }
    if (data?.status !== "1") {
      memCache.set(addr, { label: null, expireAt: now + 60 * 60 * 1000 });
      return null;
    }

    const first = Array.isArray(data?.result) ? data.result[0] : null;
    const name =
      typeof first?.ContractName === "string" ? first.ContractName.trim() : "";

    const label = name ? name : null;

    memCache.set(addr, {
      label,
      expireAt: now + (label ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000),
    });

    return label;
  } catch {
    memCache.set(addr, { label: null, expireAt: now + 60 * 60 * 1000 });
    return null;
  }
}

/**
 * 显示用：ContractName (0x....)
 * 失败降级：0x....
 */
export async function formatAddressWithLabel(address: string): Promise<string> {
  if (!isValidEthAddress(address)) return String(address || "");
  const label = await getContractLabel(address);
  return label ? `${label} (${address})` : address;
}