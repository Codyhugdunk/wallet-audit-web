// app/api/report/route.ts
import { NextRequest, NextResponse } from "next/server";

// ✅ 按你 modules 的真实导出函数名来调用（避免 export 对不上导致 route.ts 直接挂）
import { buildIdentityModule } from "./modules/identity";
import { buildAssetsModule } from "./modules/assets";
import { buildActivityModule } from "./modules/activity";
import { buildGasModule } from "./modules/gas";
import { buildRiskModule } from "./modules/risk";
import { buildSummaryModule } from "./modules/summary";
import { buildShareModule } from "./modules/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const addressRaw = (searchParams.get("address") || "").trim();
    const address = addressRaw && addressRaw.startsWith("0x") ? addressRaw : "";

    if (!address || address.length !== 42) {
      return NextResponse.json(
        { error: "请输入合法的以太坊地址（0x 开头，42 位长度）" },
        { status: 400 }
      );
    }

    const generatedAt = Date.now();

    // ✅ 和稳定版一样：四个模块并发拉数据
    const [identity, assets, activity, gas] = await Promise.all([
      buildIdentityModule(address),
      buildAssetsModule(address),
      buildActivityModule(address), // v1.1 已增强：Top 合约会变成 ContractName (0x...)
      buildGasModule(address),      // v1.1 已增强：topTxs 会带 to/toDisplay（如果你按我给的 gas.ts 改了）
    ]);

    // ✅ 同步计算模块
    const risk = buildRiskModule(assets, activity);
    const summary = buildSummaryModule(identity, assets, activity, risk);

    // share 需要 ethPrice / valueChange 等参数：目前你原本就是传 null
    // 这里 ethPrice 用 assets 内部使用的价格体系（本地 fallback / 线上真实）即可
    // assets 模块没直接返回 ethPrice，所以这里先传 0（不影响你当前分享字段）
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

    // ✅ 统计埋点：异步 fire-and-forget，不影响主流程
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