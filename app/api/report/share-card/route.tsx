// app/api/report/share-card/route.tsx
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type AnyRecord = Record<string, unknown>;

type TokenLike = {
  symbol?: string;
  tokenSymbol?: string;
  ticker?: string;
  token?:
    | {
        symbol?: string | null;
        ticker?: string | null;
      }
    | null;
  usdValue?: number;
  usd?: number;
  valueUsd?: number;
  valueUSD?: number;
  totalUsd?: number;
  totalValueUsd?: number;
  totalValue?: number;
  value?: number;
  summary?:
    | {
        usdValue?: number;
        totalValue?: number;
      }
    | null;
  [k: string]: unknown;
};

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "未知";
  return (
    "$" +
    value.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  );
}

function getTokenSymbol(t: TokenLike): string {
  if (t.symbol && typeof t.symbol === "string") return t.symbol;
  if (t.tokenSymbol && typeof t.tokenSymbol === "string") return t.tokenSymbol;
  if (t.ticker && typeof t.ticker === "string") return t.ticker;
  if (t.token && typeof t.token.symbol === "string") return t.token.symbol;
  if (t.token && typeof t.token.ticker === "string") return t.token.ticker;
  return "Unknown";
}

function getTokenUsdValue(t: TokenLike): number {
  const obj = t as AnyRecord;
  const candidate =
    obj.usdValue ??
    obj.usd ??
    obj.valueUsd ??
    obj.valueUSD ??
    obj.totalUsd ??
    obj.totalValueUsd ??
    obj.totalValue ??
    obj.value ??
    (obj.summary as AnyRecord | undefined)?.usdValue ??
    (obj.summary as AnyRecord | undefined)?.totalValue;

  return toNumber(candidate) ?? 0;
}

export async function GET(req: Request) {
  try {
    const { searchParams, origin } = new URL(req.url);
    const addressParam = searchParams.get("address") ?? "";
    const debug = searchParams.get("debug");

    const address =
      addressParam && /^0x[a-fA-F0-9]{40}$/.test(addressParam)
        ? addressParam
        : "Unknown Address";

    // ===== 安全默认值（即使 API 掛了也能出图） =====
    let totalUsd: number | null = null;
    let gasTotalEth: number | null = null;
    let txCount: number | null = null;
    let topTokenSymbol = "未知";
    let topTokenUsd: number | null = null;
    let riskLabel = "未能识别风险水平";
    let riskComment = "暂未能识别完整的资产分布，仅供基础参考。";

    // ===== 调用 /api/report 拿真实数据（失败就用默认值） =====
    try {
      if (address !== "Unknown Address") {
        const apiUrl = `${origin}/api/report?address=${encodeURIComponent(
          address
        )}`;

        const res = await fetch(apiUrl, {
          cache: "no-store",
        });

        if (res.ok) {
          const report = (await res.json()) as AnyRecord;

          // 总资产
          const tv = toNumber(report.totalValue);
          if (tv !== null) totalUsd = tv;

          // Gas 信息
          const gas = (report.gas ?? {}) as AnyRecord;
          const totalGasEthNum = toNumber(gas.totalGasEth);
          if (totalGasEthNum !== null) gasTotalEth = totalGasEthNum;
          const txCountNum = toNumber(gas.txCount);
          if (txCountNum !== null) txCount = txCountNum;

          // Top1 持仓
          const positionsRaw = report.positions;
          if (Array.isArray(positionsRaw) && positionsRaw.length > 0) {
            const positions = positionsRaw as TokenLike[];
            const sorted = [...positions].sort(
              (a, b) => getTokenUsdValue(b) - getTokenUsdValue(a)
            );
            const top = sorted[0];
            const topVal = getTokenUsdValue(top);
            if (topVal > 0) {
              topTokenSymbol = getTokenSymbol(top);
              topTokenUsd = topVal;
            }
          }

          // 风险水平：根据 allocation 做一个简易打分
          const allocRaw = report.allocation;
          if (Array.isArray(allocRaw) && allocRaw.length > 0) {
            let stableRatio = 0;
            let majorRatio = 0;
            let memeRatio = 0;

            for (const item of allocRaw as AnyRecord[]) {
              const cat = item.category;
              const ratio = toNumber(item.ratio);
              if (!ratio || typeof cat !== "string") continue;

              if (cat.includes("稳定币")) stableRatio += ratio;
              else if (cat.includes("主流")) majorRatio += ratio;
              else if (cat.toLowerCase().includes("meme")) memeRatio += ratio;
            }

            if (totalUsd !== null && totalUsd < 100) {
              riskLabel = "轻仓观察";
              riskComment =
                "整体仓位较轻，以体验和观察为主，风险敞口有限。";
            } else if (memeRatio > 0.5) {
              riskLabel = "高风险偏好";
              riskComment =
                "钱包中高风险 / Meme 资产占比较高，波动较大，注意仓位管理和风险控制。";
            } else if (stableRatio > 0.6) {
              riskLabel = "稳健偏好";
              riskComment =
                "稳定币占比较高，整体更偏向资金停泊和低波动管理，注意平台和对手方风险。";
            } else if (majorRatio > 0.6) {
              riskLabel = "主流资产为主";
              riskComment =
                "仓位以 ETH / BTC 等主流资产为主，波动中等，建议结合个人周期做再平衡。";
            } else {
              riskLabel = "分散持仓";
              riskComment =
                "资产在稳定币、主流币和长尾资产之间较为分散，建议定期复盘结构和收益风险比。";
            }
          }
        }
      }
    } catch (e) {
      console.error("share-card: fetch /api/report failed", e);
      // 用默认值兜底出图
    }

    const shortAddr =
      address === "Unknown Address"
        ? "未提供合法地址"
        : `${address.slice(0, 6)}…${address.slice(-4)}`;

    // ===== 如果带 debug=1，直接返回 JSON，方便排查线上问题 =====
    if (debug === "1") {
      return new Response(
        JSON.stringify(
          {
            ok: true,
            address,
            shortAddr,
            totalUsd,
            gasTotalEth,
            txCount,
            topTokenSymbol,
            topTokenUsd,
            riskLabel,
            riskComment,
          },
          null,
          2
        ),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        }
      );
    }

    // 风险色系
    let riskAccent = "#38bdf8";
    let riskBadgeBg = "rgba(56,189,248,0.15)";

    if (riskLabel.includes("高风险")) {
      riskAccent = "#f97316";
      riskBadgeBg = "rgba(248,113,22,0.16)";
    } else if (riskLabel.includes("稳健")) {
      riskAccent = "#22c55e";
      riskBadgeBg = "rgba(34,197,94,0.16)";
    } else if (riskLabel.includes("轻仓")) {
      riskAccent = "#a855f7";
      riskBadgeBg = "rgba(168,85,247,0.16)";
    }

    // ===== 真正生成 PNG 图片 =====
    return new ImageResponse(
      (
        <div
          style={{
            width: "1200px",
            height: "630px",
            display: "flex",
            flexDirection: "row",
            // 关键改动：确保有深色背景，不会出现「全白」
            backgroundColor: "#020617",
            backgroundImage:
              "radial-gradient(circle at 0% 0%, rgba(56,189,248,0.22), transparent 55%)",
            color: "#e5e7eb",
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
            padding: "40px 56px",
            boxSizing: "border-box",
          }}
        >
          {/* 左侧信息区 */}
          <div
            style={{
              flex: 3,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            {/* 顶部品牌 & 地址 */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {/* 品牌行 */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(148,163,184,0.4)",
                    fontSize: 11,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "#9ca3af",
                    marginRight: 14,
                    background:
                      "linear-gradient(120deg, rgba(15,23,42,0.9), rgba(15,23,42,0.4))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  WALLET AUDIT
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#64748b",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  On-chain Risk &amp; Portfolio Snapshot
                </div>
              </div>

              {/* 标题 */}
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 600,
                  color: "#f9fafb",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                链上钱包风险 &amp; 资产快照
              </div>

              {/* 地址 */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  fontSize: 14,
                  color: "#94a3b8",
                  marginBottom: 24,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    padding: "2px 8px",
                    borderRadius: 999,
                    backgroundColor: "rgba(15,23,42,0.9)",
                    border: "1px solid rgba(51,65,85,0.9)",
                    marginRight: 8,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  Address
                </span>
                <span>{shortAddr}</span>
              </div>

              {/* 三个指标卡片 */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  gap: 18,
                  marginBottom: 18,
                }}
              >
                {/* 总资产 */}
                <div
                  style={{
                    flex: 1.4,
                    padding: "16px 18px",
                    borderRadius: 18,
                    background:
                      "linear-gradient(145deg, rgba(15,23,42,0.96), rgba(15,23,42,0.85))",
                    border: "1px solid rgba(148,163,184,0.5)",
                    boxShadow:
                      "0 18px 40px rgba(15,23,42,0.9), 0 0 0 1px rgba(15,23,42,1)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: "#9ca3af",
                      marginBottom: 6,
                    }}
                  >
                    预估总资产（USD）
                  </div>
                  <div
                    style={{
                      fontSize: 34,
                      fontWeight: 700,
                      color: "#f9fafb",
                      letterSpacing: "0.03em",
                    }}
                  >
                    {formatUsd(totalUsd)}
                  </div>
                </div>

                {/* 风险水平 */}
                <div
                  style={{
                    flex: 1,
                    padding: "16px 18px",
                    borderRadius: 18,
                    background:
                      "linear-gradient(145deg, rgba(15,23,42,0.96), rgba(15,23,42,0.85))",
                    border: `1px solid ${riskAccent}`,
                    boxShadow: `0 18px 40px rgba(15,23,42,0.9), 0 0 28px ${riskBadgeBg}`,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        color: "#9ca3af",
                      }}
                    >
                      风险水平
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 8px",
                        borderRadius: 999,
                        backgroundColor: riskBadgeBg,
                        color: riskAccent,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      Risk Profile
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 600,
                      color: riskAccent,
                      lineHeight: 1.3,
                    }}
                  >
                    {riskLabel}
                  </div>
                </div>

                {/* Gas */}
                <div
                  style={{
                    flex: 1,
                    padding: "16px 18px",
                    borderRadius: 18,
                    background:
                      "linear-gradient(145deg, rgba(15,23,42,0.96), rgba(15,23,42,0.85))",
                    border: "1px solid rgba(75,85,99,0.9)",
                    boxShadow: "0 18px 40px rgba(15,23,42,0.9)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: "#9ca3af",
                      marginBottom: 6,
                    }}
                  >
                    累计 Gas（ETH）
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 600,
                      color: "#e5e7eb",
                      marginBottom: 4,
                    }}
                  >
                    {gasTotalEth !== null ? gasTotalEth.toFixed(4) : "未知"}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#9ca3af",
                    }}
                  >
                    交易次数：{txCount ?? "未知"}
                  </div>
                </div>
              </div>

              {/* Top1 持仓 */}
              <div
                style={{
                  padding: "16px 18px",
                  borderRadius: 18,
                  background:
                    "linear-gradient(145deg, rgba(15,23,42,0.96), rgba(15,23,42,0.88))",
                  border: "1px solid rgba(148,163,184,0.5)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "#9ca3af",
                    marginBottom: 6,
                  }}
                >
                  Top1 持仓
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 500,
                    marginBottom: 4,
                    color: "#e5e7eb",
                  }}
                >
                  {topTokenSymbol}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#9ca3af",
                  }}
                >
                  {topTokenUsd !== null ? formatUsd(topTokenUsd) : "金额未知"}
                </div>
              </div>
            </div>

            {/* 底部说明 */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "#9ca3af",
                  lineHeight: 1.5,
                  maxWidth: 640,
                  marginBottom: 8,
                }}
              >
                {riskComment}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                }}
              >
                Generated by WalletAudit · Telegram @WalletAuditBot ·
                walletaudit.me
              </div>
            </div>
          </div>

          {/* 右侧 Logo / 雷达区 */}
          <div
            style={{
              flex: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 280,
                height: 280,
                borderRadius: "9999px",
                background:
                  "radial-gradient(circle at 30% 20%, rgba(56,189,248,0.35), rgba(15,23,42,1) 60%)",
                border: "1.5px solid rgba(56,189,248,0.8)",
                boxShadow:
                  "0 0 40px rgba(56,189,248,0.45), 0 0 0 1px rgba(15,23,42,1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
  style={{
    display: "flex",
    flexDirection: "row",
    alignItems: "baseline",
    fontSize: 26,
    fontWeight: 600,
    color: "#e0f2fe",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  }}
>
  <span>Wallet</span>
  <span style={{ color: "#38bdf8", marginLeft: 4 }}>Audit</span>
</div>
                <div
                  style={{
                    display: "flex", 
                    fontSize: 13,
                    color: "#9ca3af",
                  }}
                >
                  On-chain Risk Snapshot
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: size.width,
        height: size.height,
      }
    );
  } catch (err) {
    console.error("share-card: unexpected error", err);
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    return new Response(`SHARE_CARD_ERROR: ${message}`, {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}