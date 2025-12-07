// app/api/report/route.ts
import { NextRequest, NextResponse } from "next/server";

// 直接按模块名调用，不再做花里胡哨的兜底，回到稳定版
import { getIdentity } from "./modules/identity";
import { getAssets } from "./modules/assets";
import { getActivity } from "./modules/activity";
import { getGasStats } from "./modules/gas";
import { getRiskAssessment } from "./modules/risk";
import { buildSummary } from "./modules/summary";
import { buildShareSnapshot } from "./modules/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const addressRaw = (searchParams.get("address") || "").trim();
    const address =
      addressRaw && addressRaw.startsWith("0x") ? addressRaw : "";

    if (!address || address.length !== 42) {
      return NextResponse.json(
        { error: "请输入合法的以太坊地址（0x 开头，42 位长度）" },
        { status: 400 },
      );
    }

    const generatedAt = Date.now();

    // 和之前一样：四个模块并发拉数据
    const [identity, assets, activity, gas] = await Promise.all([
      getIdentity(address),
      getAssets(address),
      getActivity(address),
      getGasStats(address),
    ]);

    // 纯同步计算模块
    const risk = getRiskAssessment({ identity, assets, activity, gas });
    const summary = buildSummary({ identity, assets, activity, gas, risk });
    const share = buildShareSnapshot({ address, assets, risk });

    const report = {
      version: "1.1",
      address,
      identity,
      summary,
      assets,
      activity,
      gas,
      risk,
      share,
      meta: {
        version: "1.1",
        generatedAt,
        fromCache: false,
        history: [],
        previousValue: null,
        valueChange: null,
        valueChangePct: null,
      },
    };

    // 统计埋点：异步 fire-and-forget，不影响主流程
    try {
      const statsUrl = process.env.WALLETAUDIT_STATS_HIT_URL;
      if (statsUrl) {
        fetch(statsUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: "web", address }),
          cache: "no-store",
        }).catch(() => {});
      }
    } catch {
      // 忽略统计错误
    }

    return NextResponse.json(report, { status: 200 });
  } catch (err: any) {
    console.error("[api/report] unexpected error:", err);
    return NextResponse.json(
      {
        error:
          err?.message ||
          "生成报告时出现异常，请稍后重试或联系维护者。",
      },
      { status: 500 },
    );
  }
}