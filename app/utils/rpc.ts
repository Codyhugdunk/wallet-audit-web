// app/utils/rpc.ts
// ✅ 核心设施：多线路 RPC 轮询器 (解决 Alchemy 也就是私有节点被撑爆的问题)

// 免费且高质量的公共节点列表
const PUBLIC_RPCS = [
  "https://eth.llamarpc.com",
  "https://rpc.ankr.com/eth",
  "https://cloudflare-eth.com",
  "https://1rpc.io/eth",
  "https://ethereum.publicnode.com"
];

export async function getEthBalanceWithFallback(address: string): Promise<string> {
  // 1. 先尝试环境变量里的 Alchemy (如果有)
  if (process.env.ALCHEMY_RPC_URL) {
    try {
      const val = await fetchRpc(process.env.ALCHEMY_RPC_URL, address);
      if (val !== null) return val;
    } catch (e) {
      console.warn("Alchemy failed, switching to public nodes...");
    }
  }

  // 2. Alchemy 挂了？轮询公共节点 (这是特朗普能显示余额的关键)
  for (const rpc of PUBLIC_RPCS) {
    try {
      const val = await fetchRpc(rpc, address);
      if (val !== null) return val;
    } catch (e) {
      continue; // 这个节点不行，换下一个
    }
  }

  return "0x0"; // 实在没办法了才返回 0
}

async function fetchRpc(url: string, address: string): Promise<string | null> {
  // 手写 fetch，不依赖外部工具，防止循环引用
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 3000); // 3秒超时

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [address, "latest"]
      }),
      signal: controller.signal
    });
    clearTimeout(id);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.result || null;
  } catch {
    return null;
  }
}