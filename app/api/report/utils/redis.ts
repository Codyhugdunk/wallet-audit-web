// redis.ts — WalletAudit v1.0
// Upstash Redis：PV / DAU / 历史记录模块（线上自动启用，本地禁用）

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const redisEnabled = Boolean(REDIS_URL && REDIS_TOKEN);

// 本地环境直接 NO-OP，不抛错
async function redisFetch(path: string, body?: any) {
  if (!redisEnabled) return null;
  try {
    const res = await fetch(`${REDIS_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    return await res.json();
  } catch (e) {
    return null;
  }
}

// -----------------------------
// PV：总访问量统计
// -----------------------------
export async function logPV() {
  if (!redisEnabled) return;
  await redisFetch("/incr", { key: "pv" });
}

// -----------------------------
// DAU：每日唯一钱包统计
// -----------------------------
export async function logDAU(address: string) {
  if (!redisEnabled) return;
  const day = new Date().toISOString().slice(0, 10);
  await redisFetch("/sadd", { key: `dau:${day}`, member: address });
}

// -----------------------------
// 记录钱包最近访问历史（用于 meta.history）
// 格式：wallet:0x123 = [
//   { timestamp: 1710000000, totalValue: 12345 },
//   ...
// ]
// -----------------------------
export async function pushWalletHistory(
  address: string,
  totalValue: number
) {
  if (!redisEnabled) return;

  const key = `wallet-history:${address}`;
  const entry = {
    timestamp: Date.now(),
    value: Number(totalValue) || 0,
  };

  // 最多保存 30 条
  await redisFetch("/lpush", { key, value: JSON.stringify(entry) });
  await redisFetch("/ltrim", { key, start: 0, stop: 29 });
}

export async function getWalletHistory(address: string): Promise<
  { timestamp: number; value: number }[]
> {
  if (!redisEnabled) return [];

  const key = `wallet-history:${address}`;
  const res = await redisFetch("/lrange", {
    key,
    start: 0,
    stop: 29,
  });

  if (!res || !Array.isArray(res.result)) return [];

  return res.result
    .map((x: string) => {
      try {
        return JSON.parse(x);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}