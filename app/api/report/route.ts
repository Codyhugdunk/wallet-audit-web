// app/api/report/route.ts
import { NextRequest, NextResponse } from "next/server";

import { buildIdentityModule } from "./modules/identity";
import { buildAssetsModule } from "./modules/assets";
import { buildActivityModule } from "./modules/activity";
import { buildGasModule } from "./modules/gas";
import { buildRiskModule } from "./modules/risk";
import { buildSummaryModule } from "./modules/summary";
import { buildShareModule } from "./modules/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isEthAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const addressRaw = (searchParams.get("address") || "").trim();
    const address = addressRaw.toLowerCase();

    if (!isEthAddress(address)) {
      return NextResponse.json(
        { error: "请输入合法的以太坊地址（0x 开头，40 位 hex）" },
        { status: 400 }
      );
    }

    const generatedAt = Date.now();

    // 并发获取
    const [identity, assets, activity, gas] = await Promise.all([
      buildIdentityModule(address),
      buildAssetsModule(address),
      buildActivityModule(address),
      buildGasModule(address),
    ]);

    // 同步计算
    const risk = buildRiskModule(assets, activity);
    const summary = buildSummaryModule(identity, assets, activity, risk);

    // share：暂时 ethPrice 传 0，不影响当前 UI
    const share = buildShareModule(address, assets, 0, null, null, generatedAt);

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

    // 统计埋点（可选）
    try {
      const statsUrl = process.env.WALLETAUDIT_STATS_HIT_URL;
      if (statsUrl) {
        void fetch(statsUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: "web", address }),
          cache: "no-store",
        }).catch(() => {});
      }
    } catch {
      // ignore
    }

    return NextResponse.json(report, { status: 200 });
  } catch (err: any) {
    console.error("[api/report] unexpected error:", err);
    return NextResponse.json(
      { error: err?.message || "生成报告时出现异常，请稍后重试或联系维护者。" },
      { status: 500 }
    );
  }
}