// app/api/report/utils/etherscan.ts
const ETHERSCAN_BASE = "https://api.etherscan.io/api";

/**
 * 轻量内存缓存：减少 Etherscan 请求次数，避免触发频率限制
 */
const memCache = new Map<string, { label: string | null; expireAt: number }>();

function isValidEthAddress(address: string): boolean {
  return typeof address === "string" && /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * 获取合约标签（ContractName）
 * 使用 Etherscan: module=contract&action=getsourcecode
 */
export async function getContractLabel(address: string): Promise<string | null> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) return null;
  if (!isValidEthAddress(address)) return null;

  const addr = address.toLowerCase();

  const now = Date.now();
  const hit = memCache.get(addr);
  if (hit && hit.expireAt > now) return hit.label;

  try {
    const url =
      `${ETHERSCAN_BASE}?module=contract&action=getsourcecode` +
      `&address=${addr}&apikey=${apiKey}`;

    const res = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      memCache.set(addr, { label: null, expireAt: now + 60 * 60 * 1000 }); // 失败缓存 1h
      return null;
    }

    const data: any = await res.json();
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