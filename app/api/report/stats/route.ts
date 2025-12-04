import { Redis } from "@upstash/redis";

// 和 /api/report 一样的 Redis 配置（走 REST URL + TOKEN）
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// 解析 ZRANGE 返回结果的小工具函数
function parseZRange(
  raw: unknown
): { member: string; score: number }[] {
  if (!raw) return [];

  // 兼容两种可能的返回结构：
  // 1) [ ["member", score], ["member2", score2], ... ]
  if (
    Array.isArray(raw) &&
    raw.length > 0 &&
    Array.isArray(raw[0])
  ) {
    return (raw as unknown[]).map((item) => {
      const [member, score] = item as [string, number];
      return {
        member,
        score: typeof score === "number" ? score : Number(score ?? 0),
      };
    });
  }

  // 2) [ "member1", "score1", "member2", "score2", ... ]
  if (Array.isArray(raw)) {
    const arr = raw as unknown[];
    const result: { member: string; score: number }[] = [];
    for (let i = 0; i < arr.length; i += 2) {
      const member = arr[i];
      const score = arr[i + 1];
      if (typeof member !== "string") continue;
      result.push({
        member,
        score: Number(score ?? 0),
      });
    }
    return result;
  }

  return [];
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const today = getTodayStr();

    // 一次性把所有需要的指标从 Redis 里拉出来
    const [
      pvRaw,
      uniqueWalletsRaw,
      dailyZsetRaw,
      recentWalletsZsetRaw,
      todayUniqueRaw,
    ] = await Promise.all([
      // 总 PV
      redis.get("wallet_audit:pv"),

      // 历史去重钱包总数
      redis.scard("wallet_audit:unique_wallets"),

      // 每日使用次数 ZSET
      // 这里用 rev: true，按 score 从大到小排，取最近 30 天
      redis.zrange("wallet_audit:daily", 0, 29, {
        withScores: true,
        rev: true,
      }),

      // 最近访问的钱包列表（ZSET，score = 时间戳）
      redis.zrange("wallet_audit:wallets", 0, 19, {
        withScores: true,
        rev: true,
      }),

      // 当日 DAU：今天有调用过的去重钱包数
      redis.scard(`wallet_audit:daily_unique:${today}`),
    ]);

    // 转成正常的 number
    const pv =
      typeof pvRaw === "number" ? pvRaw : Number(pvRaw ?? 0);

    const uniqueWallets =
      typeof uniqueWalletsRaw === "number"
        ? uniqueWalletsRaw
        : Number(uniqueWalletsRaw ?? 0);

    const todayActiveWallets =
      typeof todayUniqueRaw === "number"
        ? todayUniqueRaw
        : Number(todayUniqueRaw ?? 0);

    // 解析 ZSET
    const dailyParsed = parseZRange(dailyZsetRaw).map(
      ({ member, score }) => ({
        date: member,
        count: score,
      })
    );

    const topWallets = parseZRange(recentWalletsZsetRaw).map(
      ({ member, score }) => ({
        address: member,
        lastTimestamp: score,
      })
    );

    // 给前端 /admin 用的数据结构
    const result = {
      pv,
      uniqueWallets,
      todayActiveWallets,
      daily: dailyParsed, // [{ date, count }]
      topWallets, // [{ address, lastTimestamp }]
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("stats error", e);
    return new Response(
      JSON.stringify({ error: "stats_failed" }),
      { status: 500 }
    );
  }
}