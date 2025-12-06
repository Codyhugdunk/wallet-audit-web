// app/api/stats/route.ts
// WalletAudit 使用统计 API（带简单密码校验）

import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// 简单密码（管理用）。优先用环境变量，可选：ADMIN_STATS_TOKEN=xxxx
// 如果 env 没配置，就默认使用 "926498"
const ADMIN_TOKEN = process.env.ADMIN_STATS_TOKEN || "926498";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  // 必须带上正确 token 才能访问
  if (!token || token !== ADMIN_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    const [
      totalRequests,
      totalUniqueAddresses,
      todayRequests,
      todayUniqueAddresses,
    ] = await Promise.all([
      redis.get<number>("stats:requests:total"),
      redis.pfcount("stats:users:addresses"),
      redis.get<number>(`stats:requests:day:${day}`),
      redis.pfcount(`stats:users:addresses:${day}`),
    ]);

    return NextResponse.json({
      day,
      totalRequests: totalRequests || 0,
      totalUniqueAddresses: totalUniqueAddresses || 0,
      todayRequests: todayRequests || 0,
      todayUniqueAddresses: todayUniqueAddresses || 0,
    });
  } catch (err) {
    console.error("[stats] fetch error", err);
    return NextResponse.json(
      { error: "Stats fetch failed" },
      { status: 500 }
    );
  }
}