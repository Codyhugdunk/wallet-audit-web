// app/api/sharecard/route.tsx
import { NextRequest, NextResponse } from "next/server";
import { ImageResponse } from "next/og";

export const runtime = "edge";

function shortAddr(a: string) {
  const s = (a || "").toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(s)) return a || "";
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

function formatUsd(v: number, lang: "cn" | "en") {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return "—";

  if (lang === "cn") {
    if (n >= 100_000_000) return `¥${(n / 7.2 / 100_000_000).toFixed(2)}亿`; // 仅示意
    if (n >= 10_000) return `$${(n / 10_000).toFixed(2)}万`;
  }
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const address = (searchParams.get("address") || "").trim();
    const lang = (searchParams.get("lang") === "en" ? "en" : "cn") as "cn" | "en";
    const score = Number(searchParams.get("score") || "0");
    const persona = (searchParams.get("persona") || "").trim();
    const totalValue = Number(searchParams.get("totalValue") || "0");
    const warning = (searchParams.get("warning") || "").trim();

    const isSafe = score >= 80;
    const accent = isSafe ? "#34d399" : score <= 50 ? "#f87171" : "#fbbf24";

    return new ImageResponse(
      (
        <div
          style={{
            width: 900,
            height: 450,
            backgroundColor: "#0a0a0a",
            display: "flex",
            padding: 36,
            boxSizing: "border-box",
            fontFamily: "Arial, sans-serif",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 24,
              border: "1px solid #222",
              backgroundColor: "#0b1220",
              position: "relative",
              overflow: "hidden",
              display: "flex",
              flexDirection: "row",
              padding: 28,
              boxSizing: "border-box",
              gap: 24,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 8,
                backgroundColor: accent,
              }}
            />

            {/* Left */}
            <div
              style={{
                width: 260,
                height: "100%",
                borderRadius: 18,
                border: "1px solid #1f2937",
                backgroundColor: "#0f172a",
                display: "flex",
                flexDirection: "column",
                padding: 22,
                boxSizing: "border-box",
                justifyContent: "center",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ fontSize: 14, color: "#94a3b8" }}>
                {lang === "en" ? "RISK SCORE" : "风险评分"}
              </div>
              <div style={{ fontSize: 86, fontWeight: 900, color: accent, lineHeight: 1 }}>
                {Number.isFinite(score) ? score : 0}
              </div>
              <div
                style={{
                  marginTop: 6,
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: "1px solid #334155",
                  backgroundColor: "#111827",
                  color: "#e2e8f0",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {persona || (lang === "en" ? "Persona" : "画像类型")}
              </div>
            </div>

            {/* Right */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#ffffff" }}>WalletAudit</div>
                <div style={{ fontSize: 14, color: "#94a3b8" }}>{new Date().toLocaleDateString()}</div>
              </div>

              <div style={{ fontSize: 16, color: "#94a3b8" }}>
                {lang === "en" ? "Address" : "地址"}:{" "}
                <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{shortAddr(address)}</span>
              </div>

              <div
                style={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #1f2937",
                  borderRadius: 18,
                  padding: 22,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 14, color: "#94a3b8", letterSpacing: 1 }}>
                  {lang === "en" ? "PRICED NET WORTH" : "可定价资产估值"}
                </div>
                <div style={{ fontSize: 44, fontWeight: 900, color: "#e2e8f0", lineHeight: 1 }}>
                  {formatUsd(totalValue, lang)}
                </div>

                {warning ? (
                  <div style={{ marginTop: 8, fontSize: 14, color: "#94a3b8", lineHeight: 1.4 }}>
                    {warning}
                  </div>
                ) : null}
              </div>

              <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontSize: 14, color: "#94a3b8" }}>
                  {lang === "en" ? "Scan:" : "访问："}{" "}
                  <span style={{ color: "#60a5fa", fontWeight: 800 }}>walletaudit.me</span>
                </div>
                <div style={{ fontSize: 14, color: "#334155" }}>© WalletAudit</div>
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
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "sharecard_failed" }, { status: 500 });
  }
}