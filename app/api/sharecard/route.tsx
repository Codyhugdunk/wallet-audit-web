// app/api/sharecard/route.tsx
import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";

export const runtime = "edge";

type Lang = "cn" | "en";

function pickLang(v: string | null): Lang {
  return v === "en" ? "en" : "cn";
}

function clampScore(n: number) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

function shortAddr(a: string) {
  const s = (a || "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(s)) return s || "0x…";
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function formatUsd(v: number, lang: Lang) {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n <= 0) return lang === "en" ? "$0" : "￥0";

  // 这里统一展示 USD（你的产品当前也主要以 USD 做资产估值）
  // 如需 CN 显示 RMB，后续再扩展。
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function safeText(v: string | null, fallback = "") {
  const s = (v || "").trim();
  return s.length ? s : fallback;
}

function getAccent(score: number) {
  // 纯 hex，避免任何 lab/oklch 解析
  if (score >= 80) return "#34D399"; // green
  if (score <= 50) return "#F87171"; // red
  return "#FBBF24"; // amber
}

function Logo() {
  // 简化版：不使用 gradient/defs，保证 @vercel/og / next/og 稳定渲染
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="256" cy="256" r="256" fill="#020617" />
      <circle cx="256" cy="256" r="190" stroke="#1D4ED8" strokeWidth="12" strokeOpacity="0.35" />
      <circle cx="256" cy="256" r="140" stroke="#3B82F6" strokeWidth="16" strokeOpacity="0.22" />
      <path
        d="M106 256 H156 L206 146 L286 366 L356 186 L386 256 H406"
        stroke="#60A5FA"
        strokeWidth="22"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.55"
      />
      <path
        d="M106 256 H156 L206 146 L286 366 L356 186 L386 256 H406"
        stroke="#FFFFFF"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // ✅ 只用 query，避免 body 解析不稳定
    const lang = pickLang(searchParams.get("lang"));
    const address = safeText(searchParams.get("address"), "0x…");
    const persona = safeText(searchParams.get("persona"), lang === "en" ? "Persona" : "画像类型");
    const warning = safeText(searchParams.get("warning"), "");
    const scoreRaw = Number(searchParams.get("score") || "0");
    const totalValueRaw = Number(searchParams.get("totalValue") || "0");

    const score = clampScore(scoreRaw);
    const accent = getAccent(score);

    const title = "WalletAudit";
    const subtitle =
      lang === "en"
        ? "Behavior Insights · Persona · Smart Profile"
        : "行为洞察 · Persona · 智能画像";

    const scoreLabel = lang === "en" ? "RISK SCORE" : "综合风险评分";
    const personaLabel = lang === "en" ? "PERSONA" : "画像类型";
    const worthLabel = lang === "en" ? "NET WORTH" : "总资产估值";
    const noteLabel = lang === "en" ? "NOTE" : "提示";
    const addrLabel = lang === "en" ? "ADDRESS" : "地址";

    const worthText = formatUsd(totalValueRaw, lang);

    // ✅ 如果价格缺失别写成“0”，而是用 warning 带出（你后续会做“缺价≠0”的 UI）
    const noteText =
      warning ||
      (lang === "en"
        ? "Estimates only. Some assets may be unpriced."
        : "估值为估算，部分资产可能缺少价格。");

    // 1200×630：社交平台标准清晰尺寸
    return new ImageResponse(
      (
        <div
          style={{
            width: "1200px",
            height: "630px",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#05070B",
            padding: "48px",
            fontFamily: "Arial, Helvetica, sans-serif",
            color: "#E5E7EB",
            boxSizing: "border-box",
            position: "relative",
          }}
        >
          {/* top accent bar */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "10px",
              backgroundColor: accent,
            }}
          />

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <Logo />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#FFFFFF", letterSpacing: 0.2 }}>
                  {title}
                </div>
                <div style={{ fontSize: 14, color: "#94A3B8" }}>{subtitle}</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <div style={{ fontSize: 12, color: "#94A3B8" }}>
                {new Date().toLocaleDateString("en-US")}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#E2E8F0",
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: "1px solid #1F2937",
                  backgroundColor: "#0B1220",
                }}
              >
                walletaudit.me
              </div>
            </div>
          </div>

          {/* Main */}
          <div style={{ display: "flex", flex: 1, gap: "28px", marginTop: "34px" }}>
            {/* Left big score */}
            <div
              style={{
                flex: 1,
                borderRadius: 22,
                border: "1px solid #111827",
                backgroundColor: "#070A11",
                padding: "28px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -120,
                  right: -120,
                  width: 360,
                  height: 360,
                  borderRadius: 999,
                  backgroundColor: "#0B1220",
                  border: "1px solid #111827",
                }}
              />

              <div style={{ position: "relative" }}>
                <div style={{ fontSize: 13, color: "#94A3B8", letterSpacing: 1.4 }}>
                  {scoreLabel}
                </div>

                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 10 }}>
                  <div style={{ fontSize: 92, fontWeight: 900, color: accent, lineHeight: 1 }}>
                    {score}
                  </div>
                  <div style={{ fontSize: 18, color: "#94A3B8" }}>/100</div>
                </div>

                <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 12, color: "#94A3B8", letterSpacing: 1.2 }}>
                    {personaLabel}
                  </div>
                  <div
                    style={{
                      display: "inline-flex",
                      alignSelf: "flex-start",
                      padding: "8px 14px",
                      borderRadius: 999,
                      border: "1px solid #1F2937",
                      backgroundColor: "#0B1220",
                      color: "#E2E8F0",
                      fontSize: 15,
                      fontWeight: 700,
                      maxWidth: 520,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {persona}
                  </div>
                </div>
              </div>

              <div
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  paddingTop: 16,
                  borderTop: "1px solid #111827",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 12, color: "#94A3B8", letterSpacing: 1.2 }}>
                      {worthLabel}
                    </div>
                    <div style={{ fontSize: 34, fontWeight: 900, color: "#FFFFFF" }}>
                      {worthText}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                    <div style={{ fontSize: 12, color: "#94A3B8", letterSpacing: 1.2 }}>
                      {addrLabel}
                    </div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: "#E2E8F0",
                        padding: "8px 12px",
                        borderRadius: 12,
                        border: "1px solid #1F2937",
                        backgroundColor: "#0B1220",
                      }}
                    >
                      {shortAddr(address)}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 13,
                    color: "#CBD5E1",
                    backgroundColor: "#0B1220",
                    border: "1px solid #1F2937",
                    borderRadius: 14,
                    padding: "12px 14px",
                    lineHeight: 1.45,
                  }}
                >
                  <span style={{ color: "#94A3B8", marginRight: 8 }}>{noteLabel}:</span>
                  {noteText}
                </div>
              </div>
            </div>

            {/* Right - selling points */}
            <div style={{ width: 420, display: "flex", flexDirection: "column", gap: 18 }}>
              <div
                style={{
                  borderRadius: 22,
                  border: "1px solid #111827",
                  backgroundColor: "#070A11",
                  padding: "22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>
                  {lang === "en" ? "What WalletAudit tells you" : "WalletAudit 能告诉你什么"}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: 16,
                      border: "1px solid #1F2937",
                      backgroundColor: "#0B1220",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#94A3B8", letterSpacing: 1.1 }}>
                      {lang === "en" ? "Behavior Insights" : "行为洞察"}
                    </div>
                    <div style={{ fontSize: 14, color: "#E2E8F0", marginTop: 4, lineHeight: 1.4 }}>
                      {lang === "en"
                        ? "Scan on-chain actions to reveal patterns beyond balance."
                        : "从链上行为中提炼模式，而不只看余额。"}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: 16,
                      border: "1px solid #1F2937",
                      backgroundColor: "#0B1220",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#94A3B8", letterSpacing: 1.1 }}>
                      {lang === "en" ? "Persona" : "Persona"}
                    </div>
                    <div style={{ fontSize: 14, color: "#E2E8F0", marginTop: 4, lineHeight: 1.4 }}>
                      {lang === "en"
                        ? "A human-readable profile: trader, holder, whale, degenerate…"
                        : "把地址翻译成“人话画像”：交易者、持有者、巨鲸、Degen…"}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: 16,
                      border: "1px solid #1F2937",
                      backgroundColor: "#0B1220",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#94A3B8", letterSpacing: 1.1 }}>
                      {lang === "en" ? "Smart Profile" : "智能画像"}
                    </div>
                    <div style={{ fontSize: 14, color: "#E2E8F0", marginTop: 4, lineHeight: 1.4 }}>
                      {lang === "en"
                        ? "A fast summary you can share—clean, consistent, reliable."
                        : "可分享的一页结论：干净、统一、稳定。"}
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderRadius: 22,
                  border: "1px solid #111827",
                  backgroundColor: "#070A11",
                  padding: "22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>
                  {lang === "en" ? "Try it now" : "现在就试试"}
                </div>
                <div style={{ fontSize: 14, color: "#94A3B8", lineHeight: 1.5 }}>
                  {lang === "en"
                    ? "Paste any address and get a behavioral snapshot in seconds."
                    : "粘贴任意地址，几秒得到一份行为快照。"}
                </div>
                <div style={{ fontSize: 16, fontWeight: 900, color: "#60A5FA" }}>walletaudit.me</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, color: "#64748B" }}>
              {lang === "en"
                ? "On-chain data. No custody. No login."
                : "链上数据 · 不托管 · 无需登录"}
            </div>
            <div style={{ fontSize: 12, color: "#64748B" }}>
              {lang === "en" ? "Share responsibly." : "请理性分享。"}
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        headers: {
          "content-type": "image/png",
          "cache-control": "no-store",
        },
      }
    );
  } catch (e: any) {
    // ✅ 让前端能看到具体错误
    return new Response(`Sharecard error: ${e?.message || String(e)}`, { status: 500 });
  }
}