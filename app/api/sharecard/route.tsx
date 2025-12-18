// app/api/sharecard/route.tsx
// Server-side share card generation (NO DOM snapshot, avoids `lab()` parse errors)

import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

function isEthAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function formatUSD(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `$${(n / 10_000).toFixed(2)}W`;
  return `$${n.toFixed(2)}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const addressRaw = (searchParams.get("address") || "").trim();
  const lang = (searchParams.get("lang") || "cn") as "cn" | "en";
  const address = addressRaw.toLowerCase();

  if (!isEthAddress(address)) {
    return new Response("Invalid address", { status: 400 });
  }

  // 拉你的报告 API（同域）
  const origin = new URL(req.url).origin;
  const reportUrl = `${origin}/api/report?address=${address}`;
  const report: any = await fetch(reportUrl, { cache: "no-store" }).then((r) => r.json());

  const score = Number(report?.risk?.score ?? 0);
  const persona = String(report?.risk?.personaType ?? "");
  const totalValue = Number(report?.assets?.totalValue ?? 0);
  const warning = report?.assets?.priceWarning ? String(report.assets.priceWarning) : "";

  const accent = score >= 80 ? "#34d399" : score <= 50 ? "#f87171" : "#fbbf24";

  const title = "WalletAudit";
  const riskLabel = lang === "en" ? "Risk Score" : "综合风险评分";
  const worthLabel = lang === "en" ? "Net Worth" : "总资产估值";
  const noteLabel = lang === "en" ? "Note: Missing price ≠ 0 value" : "提示：价格缺失 ≠ 资产为 0";

  return new ImageResponse(
    (
      <div
        style={{
          width: 900,
          height: 450,
          background: "#0a0a0a",
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          padding: 36,
          fontFamily: "Arial, sans-serif",
          borderRadius: 24,
          border: "1px solid #222",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            right: 0,
            height: 10,
            background: accent,
          }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{title}</div>
          <div style={{ fontSize: 16, color: "#94a3b8" }}>{shortAddr(address)}</div>
        </div>

        <div style={{ display: "flex", marginTop: 24, gap: 24, flex: 1 }}>
          <div
            style={{
              flex: 1,
              background: "#111",
              border: "1px solid #222",
              borderRadius: 18,
              padding: 24,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <div style={{ fontSize: 14, color: "#94a3b8", letterSpacing: 1 }}>{riskLabel}</div>
            <div style={{ fontSize: 92, fontWeight: 900, color: accent, lineHeight: 1 }}>{score}</div>
            <div
              style={{
                marginTop: 12,
                display: "inline-flex",
                alignSelf: "flex-start",
                padding: "8px 14px",
                borderRadius: 999,
                background: "#1e293b",
                border: "1px solid #334155",
                color: "#e2e8f0",
                fontSize: 14,
              }}
            >
              {persona || (lang === "en" ? "Persona" : "画像类型")}
            </div>
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
            <div
              style={{
                background: "#111",
                border: "1px solid #222",
                borderRadius: 18,
                padding: 24,
              }}
            >
              <div style={{ fontSize: 14, color: "#94a3b8", letterSpacing: 1 }}>{worthLabel}</div>
              <div style={{ fontSize: 44, fontWeight: 900, marginTop: 6 }}>{formatUSD(totalValue)}</div>
              <div style={{ marginTop: 10, fontSize: 14, color: "#94a3b8" }}>{noteLabel}</div>
            </div>

            <div
              style={{
                background: "#0f172a",
                border: "1px solid #1f2937",
                borderRadius: 18,
                padding: 18,
                color: "#cbd5e1",
                fontSize: 14,
                lineHeight: 1.4,
                flex: 1,
              }}
            >
              <div style={{ color: "#60a5fa", fontWeight: 800 }}>walletaudit.me</div>
              <div style={{ marginTop: 10 }}>
                {warning
                  ? warning
                  : lang === "en"
                    ? "Prices are estimated. Some assets may be unpriced."
                    : "估值为估算值，部分资产可能缺少价格。"}
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 900,
      height: 450,
      headers: {
        "cache-control": "no-store",
        "content-type": "image/png",
      },
    }
  );
}