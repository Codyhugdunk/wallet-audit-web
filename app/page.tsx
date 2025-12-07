"use client";

import { useState, useRef } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

type AllocationItem = {
  category: string;
  value: number;
  ratio: number;
};

type TokenBalance = {
  contractAddress: string;
  symbol: string;
  amount: number;
  value: number;
  decimals: number;
  hasPrice: boolean;
};

type Report = {
  version: string;
  address: string;
  identity: {
    address: string;
    isContract: boolean;
    createdAt: number | null;
  };
  summary: {
    text: string;
  };
  assets: {
    eth: {
      amount: number;
      value: number;
    };
    tokens: TokenBalance[];
    totalValue: number;
    allocation: AllocationItem[];
    otherTokens: TokenBalance[];
    priceWarning: string | null;
  };
  activity: {
    txCount: number;
    activeDays: number;
    contractsInteracted: number;
    topContracts: string[];
    weeklyHistogram: { weekStart: number; count: number }[];
  };
  gas: {
    txCount: number;
    totalGasEth: number;
    totalGasUsd: number;
    topTxs: { hash: string; gasEth: number }[];
  };
  risk: {
    level: string;
    score: number;
    comment: string;
    stableRatio: number;
    memeRatio: number;
    otherRatio: number;
    txCount: number;
    personaType: string;
    personaTags: string[];
  };
  share: {
    shortAddr: string;
    ethAmount: number;
    ethPrice: number;
    totalValue: number;
    valueChange: number | null;
    valueChangePct: number | null;
    timestamp: number;
  };
  meta: {
    version: string;
    generatedAt: number;
    fromCache: boolean;
    history: { timestamp: number; totalValue: number }[];
    previousValue: number | null;
    valueChange: number | null;
    valueChangePct: number | null;
  };
};

// ===== Telegram 频道配置 =====
// 展示用：写「@频道名」
const TG_CHANNEL_HANDLE = "@walletaudit";
// 跳转用：完整 URL
const TG_CHANNEL_URL = "https://t.me/walletaudit";

// 工具函数
function trimZero(numStr: string): string {
  return numStr.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function formatUsd(v: number) {
  if (!Number.isFinite(v) || v <= 0) return "0";
  if (v < 1_000) return trimZero(v.toFixed(2));
  if (v < 10_000) return String(Math.round(v));
  const wan = v / 10_000;
  if (wan < 10_000) return `${trimZero(wan.toFixed(2))}万`;
  const yi = wan / 10_000;
  return `${trimZero(yi.toFixed(2))}亿`;
}

function formatPct(ratio: number) {
  if (!Number.isFinite(ratio)) return "-";
  return (ratio * 100).toFixed(1).replace(/\.0$/, "") + "%";
}

function formatDate(ts: number | null) {
  if (!ts) return "未知";
  const d = new Date(ts);
  return d.toLocaleString();
}

// Token 数量显示（兼顾大额和小额）
function formatTokenAmount(v: number) {
  if (!Number.isFinite(v) || v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return trimZero(v.toFixed(0));
  if (abs >= 1) return trimZero(v.toFixed(4));
  return trimZero(v.toFixed(6));
}

function RiskBadge({ level }: { level: string }) {
  const color =
    level === "Low"
      ? "border-emerald-400/60 text-emerald-300 bg-emerald-500/10"
      : level === "High"
      ? "border-rose-400/70 text-rose-300 bg-rose-500/10"
      : "border-amber-400/70 text-amber-300 bg-amber-500/10";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${color}`}
    >
      风险等级：{level}
    </span>
  );
}

function TagBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-600/70 bg-slate-900/80 px-2 py-0.5 text-[11px] text-slate-200">
      {children}
    </span>
  );
}

function shortenAddress(addr: string): string {
  if (!addr || addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function buildShareText(report: Report): string {
  const shortAddr =
    report.share?.shortAddr && report.share.shortAddr.length > 0
      ? report.share.shortAddr
      : shortenAddress(report.address);

  const totalValue = report.assets?.totalValue ?? 0;
  const totalText = formatUsd(totalValue);

  const persona = report.risk?.personaType || "钱包持仓地址";
  const score = report.risk?.score ?? 0;
  const stableRatio = report.risk?.stableRatio ?? 0;
  const stablePct = (stableRatio * 100).toFixed(1).replace(/\.0$/, "");

  const txCount = report.activity?.txCount ?? 0;
  const activeDays = report.activity?.activeDays ?? 0;

  const riskLevel = report.risk?.level ?? "";
  const riskLabel =
    riskLevel === "Low"
      ? "整体风险偏低"
      : riskLevel === "High"
      ? "整体风险偏高"
      : riskLevel === "Medium"
      ? "整体风险中等"
      : "";

  const parts: string[] = [];
  parts.push(
    `我的以太坊地址 ${shortAddr}，当前总资产约 ${totalText} 美元，属于「${persona}」。`
  );
  parts.push(
    `风险评分 ${score}/100${riskLabel ? `，${riskLabel}` : ""}，稳定币占比约 ${stablePct}%。`
  );
  if (txCount > 0) {
    parts.push(`最近 ${activeDays} 天内共发生 ${txCount} 笔交易。`);
  } else {
    parts.push(`近期几乎没有主动交易行为。`);
  }
  parts.push(`这份报告由 WalletAudit 自动生成：https://www.walletaudit.me/`);
  return parts.join("");
}

const PIE_COLORS = ["#22d3ee", "#a855f7", "#22c55e", "#f97316", "#eab308"];

// ---------- 资产配置 ----------
function AllocationCard({ report }: { report: Report }) {
  const allocation = report.assets?.allocation ?? [];
  const totalValue = report.assets?.totalValue ?? 0;

  const chartData = allocation
    .filter((item) => item.ratio > 0)
    .map((item) => ({
      category: item.category,
      percent: item.ratio,
      value: item.value,
    }));

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-950/95 via-zinc-900/90 to-slate-950/95 shadow-[0_0_40px_rgba(15,23,42,0.9)] p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold tracking-wide">资产配置概览</h2>
        <span className="text-[11px] text-slate-400">
          总资产：${formatUsd(totalValue)}
        </span>
      </div>

      {chartData.length === 0 ? (
        <p className="text-xs text-slate-400">
          暂未统计到可用的资产配置数据。
        </p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="h-44 sm:h-40 sm:flex-1">
            <div className="relative h-full w-full rounded-2xl bg-gradient-to-br from-slate-900/80 via-slate-950/90 to-black/90 border border-slate-800/90 overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.35),_transparent_60%)]" />
              <div className="relative h-full w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="percent"
                      nameKey="category"
                      innerRadius={55}
                      outerRadius={75}
                      cornerRadius={6}
                      paddingAngle={2}
                    >
                      {chartData.map((entry, index) => (
                        <Cell
                          key={entry.category}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                          stroke="#020617"
                          strokeWidth={1}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background:
                          "radial-gradient(circle at top, #020617, #020617)",
                        border: "1px solid rgba(51,65,85,0.9)",
                        borderRadius: 12,
                        padding: 10,
                        fontSize: 11,
                      }}
                      cursor={{ fill: "rgba(148,163,184,0.15)" }}
                      formatter={(value: any, _name: any, item: any) => [
                        `${formatUsd(item.payload.value)} · ${formatPct(
                          Number(value)
                        )}`,
                        item.payload.category,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-[11px] text-slate-300">
                  <span className="text-[10px] text-slate-500 mb-0.5">
                    总资产估值
                  </span>
                  <span className="text-sm font-semibold">
                    ${formatUsd(totalValue)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="sm:flex-1">
            <ul className="space-y-1.5 text-xs">
              {allocation.map((item) => (
                <li
                  key={item.category}
                  className="flex items-center justify-between"
                >
                  <span className="flex items-center gap-2 text-slate-200">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          PIE_COLORS[
                            allocation.findIndex(
                              (x) => x.category === item.category
                            ) % PIE_COLORS.length
                          ],
                      }}
                    />
                    {item.category}
                  </span>
                  <span className="text-slate-400">
                    ${formatUsd(item.value)} · {formatPct(item.ratio)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {report.assets.priceWarning && (
        <p className="mt-2 text-[11px] text-amber-300/80">
          {report.assets.priceWarning}
        </p>
      )}
    </div>
  );
}

// ---------- 主要持仓明细 ----------
function HoldingsCard({ report }: { report: Report }) {
  const { eth, tokens, otherTokens, totalValue } = report.assets;
  const mainTokens = tokens ?? [];

  const rows: {
    key: string;
    symbol: string;
    amount: number;
    value: number;
  }[] = [];

  // ETH 作为第一行
  if (eth && (eth.amount !== 0 || eth.value !== 0)) {
    rows.push({
      key: "ETH",
      symbol: "ETH",
      amount: eth.amount,
      value: eth.value,
    });
  }

  // 取前 5 个主要 Token
  mainTokens.slice(0, 5).forEach((t) => {
    rows.push({
      key: t.contractAddress || t.symbol,
      symbol: t.symbol || "Token",
      amount: t.amount,
      value: t.value,
    });
  });

  const hasMore =
    Array.isArray(otherTokens) && otherTokens.length > 0;

  if (rows.length === 0 && !hasMore) {
    return (
      <div className="rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-950/95 via-zinc-900/90 to-slate-950/95 p-4 text-xs text-slate-400">
        <h2 className="text-sm font-semibold mb-2">主要持仓明细</h2>
        <p>暂未统计到可用的持仓数据。</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-950/95 via-zinc-900/90 to-slate-950/95 p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">主要持仓明细</h2>
        <span className="text-[11px] text-slate-400">
          当前总资产：${formatUsd(totalValue)}
        </span>
      </div>
      <div className="rounded-xl border border-slate-800/80 bg-black/50 overflow-hidden">
        <table className="min-w-full text-[11px]">
          <thead className="bg-slate-900/80">
            <tr className="text-slate-400">
              <th className="px-3 py-2 text-left font-normal">资产</th>
              <th className="px-3 py-2 text-right font-normal">数量</th>
              <th className="px-3 py-2 text-right font-normal">估值 (USD)</th>
              <th className="px-3 py-2 text-right font-normal">占比</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const ratio =
                totalValue > 0 ? row.value / totalValue : 0;
              return (
                <tr
                  key={row.key}
                  className="border-t border-slate-800/80 text-slate-200"
                >
                  <td className="px-3 py-1.5 align-middle">
                    <span className="font-medium">{row.symbol}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right align-middle font-mono">
                    {formatTokenAmount(row.amount)}
                  </td>
                  <td className="px-3 py-1.5 text-right align-middle">
                    ${formatUsd(row.value)}
                  </td>
                  <td className="px-3 py-1.5 text-right align-middle">
                    {formatPct(ratio)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <p className="mt-2 text-[11px] text-slate-400">
          还有 {otherTokens.length} 个长尾资产未完全展示，未来 Pro
          版本会提供完整列表与导出功能。
        </p>
      )}
    </div>
  );
}

// ---------- 行为画像 ----------
function ActivityCard({ report }: { report: Report }) {
  const a = report.activity;

  const hist = [...(a.weeklyHistogram ?? [])]
    .sort((x, y) => x.weekStart - y.weekStart)
    .slice(-8)
    .map((item) => {
      const d = new Date(item.weekStart);
      const label = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
      return {
        label,
        count: item.count,
      };
    });

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-950/95 via-zinc-900/90 to-slate-950/95 p-4">
      <h2 className="text-sm font-semibold mb-2">行为画像（近期）</h2>
      {a.txCount === 0 ? (
        <p className="text-xs text-slate-400">近期几乎没有主动交易行为。</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-xs text-slate-300 mb-3">
            <div>
              <p className="text-slate-400">交易笔数</p>
              <p className="font-semibold">{a.txCount}</p>
            </div>
            <div>
              <p className="text-slate-400">活跃天数</p>
              <p className="font-semibold">{a.activeDays}</p>
            </div>
            <div>
              <p className="text-slate-400">交互对象</p>
              <p className="font-semibold">{a.contractsInteracted}</p>
            </div>
          </div>

          <div className="h-40 mb-3 rounded-xl border border-slate-800/80 bg-slate-950/90">
            {hist.length === 0 ? (
              <p className="text-xs text-slate-500 p-3">
                近期交易分布数据不足，无法绘制图表。
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hist}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      background:
                        "radial-gradient(circle at top, #020617, #020617)",
                      border: "1px solid rgba(51,65,85,0.9)",
                      borderRadius: 12,
                      padding: 10,
                      fontSize: 11,
                    }}
                    cursor={{ fill: "rgba(56,189,248,0.13)" }}
                    formatter={(value: any) => [
                      `${value} 笔交易`,
                      "周内交易",
                    ]}
                  />
                  <Bar
                    dataKey="count"
                    radius={[6, 6, 0, 0]}
                    barSize={18}
                    fill="#38bdf8"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="text-xs text-slate-300">
            <p className="text-slate-400 mb-1">Top 合约地址</p>
            {a.topContracts.length === 0 ? (
              <p className="text-xs text-slate-500">
                暂无明显高频交互合约。
              </p>
            ) : (
              <ul className="space-y-1">
                {a.topContracts.map((c) => (
                  <li
                    key={c}
                    className="text-[11px] font-mono text-slate-300 break-all"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Gas ----------
function GasCard({ report }: { report: Report }) {
  const g = report.gas;
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-950/95 via-zinc-900/90 to-slate-950/95 p-4">
      <h2 className="text-sm font-semibold mb-2">
        Gas 消耗概览（最近 50 笔）
      </h2>
      {g.txCount === 0 ? (
        <p className="text-xs text-slate-400">暂无可统计的 Gas 数据。</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-xs text-slate-300 mb-2">
            <div>
              <p className="text-slate-400">统计交易数</p>
              <p className="font-semibold">{g.txCount}</p>
            </div>
            <div>
              <p className="text-slate-400">总 Gas 消耗</p>
              <p className="font-semibold">{g.totalGasEth.toFixed(4)} ETH</p>
            </div>
            <div>
              <p className="text-slate-400">折合金额</p>
              <p className="font-semibold">${formatUsd(g.totalGasUsd)}</p>
            </div>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-1">
              Gas 消耗最高的交易（Top 3）
            </p>
            {g.topTxs.length === 0 ? (
              <p className="text-xs text-slate-500">暂无数据。</p>
            ) : (
              <ul className="space-y-1">
                {g.topTxs.map((tx, index) => (
                  <li
                    key={`${tx.hash}-${index}`} // 确保 key 唯一
                    className="text-[11px] text-slate-300 flex justify-between gap-2"
                  >
                    <span className="font-mono truncate max-w-[220px]">
                      {tx.hash}
                    </span>
                    <span>{tx.gasEth.toFixed(5)} ETH</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- 风险 ----------
function RiskCard({ report }: { report: Report }) {
  const r = report.risk;
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-950/95 via-zinc-900/90 to-slate-950/95 p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">风险评估</h2>
        <RiskBadge level={r.level} />
      </div>
      <p className="text-xs text-slate-300 mb-1">
        人格类型：<span className="font-semibold">{r.personaType}</span>
      </p>
      {r.personaTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {r.personaTags.map((tag) => (
            <TagBadge key={tag}>{tag}</TagBadge>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-300 mb-2">
        综合评分：<span className="font-semibold">{r.score}</span>/100
      </p>
      <p className="text-xs text-slate-400 mb-3">{r.comment}</p>
      <div className="grid grid-cols-3 gap-2 text-xs text-slate-300">
        <div>
          <p className="text-slate-400">稳定币占比</p>
          <p className="font-semibold">{formatPct(r.stableRatio)}</p>
        </div>
        <div>
          <p className="text-slate-400">Meme 占比</p>
          <p className="font-semibold">{formatPct(r.memeRatio)}</p>
        </div>
        <div>
          <p className="text-slate-400">其他资产</p>
          <p className="font-semibold">{formatPct(r.otherRatio)}</p>
        </div>
      </div>
    </div>
  );
}

// ---------- 页面主组件 ----------
export default function HomePage() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [channelCopyHint, setChannelCopyHint] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement | null>(null);

  const tgChannelUrl =
    TG_CHANNEL_URL ||
    (TG_CHANNEL_HANDLE && TG_CHANNEL_HANDLE.startsWith("@")
      ? `https://t.me/${TG_CHANNEL_HANDLE.slice(1)}`
      : "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setReport(null);

    const addr = address.trim();
    if (!addr.startsWith("0x") || addr.length !== 42) {
      setError("请输入合法的以太坊地址（0x 开头，42 位长度）");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/report?address=${encodeURIComponent(addr)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `接口返回错误：${res.status}`);
      }
      const data = (await res.json()) as Report;
      setReport(data);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "获取报告失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyShare = async () => {
    if (!report) return;
    const text = buildShareText(report);

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopyHint("分享文案已复制，可直接粘贴到 X / TG / 朋友圈。");
      setTimeout(() => setCopyHint(null), 2500);
    } catch (err) {
      console.error("复制分享文案失败：", err);
      setCopyHint("复制失败，可以先手动选中文案复制。");
      setTimeout(() => setCopyHint(null), 2500);
    }
  };

  const handleCopyChannel = async () => {
    if (!TG_CHANNEL_HANDLE) return;
    try {
      const text = TG_CHANNEL_HANDLE;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setChannelCopyHint("频道名已复制，可在 TG 搜索栏直接粘贴。");
      setTimeout(() => setChannelCopyHint(null), 2500);
    } catch (err) {
      console.error("复制频道名失败：", err);
      setChannelCopyHint("复制失败，可以手动选中频道名复制。");
      setTimeout(() => setChannelCopyHint(null), 2500);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-slate-950 to-zinc-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-wide">
              WalletAudit · 链上钱包审计报告
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              输入任意以太坊地址，生成一份结构化的资产与行为分析报告。
            </p>
            {(copyHint || channelCopyHint) && (
              <p className="mt-1 text-[11px] text-emerald-400">
                {copyHint || channelCopyHint}
              </p>
            )}
          </div>
          {report && (
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={handleCopyShare}
                className="inline-flex items-center rounded-full border border-emerald-400/70 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20 transition-colors"
              >
                复制分享文案
              </button>
              <span className="text-[11px] text-slate-500">
                截图保存建议先用系统截图，后续会上线一键分享卡片。
              </span>
            </div>
          )}
        </header>

        <section className="rounded-2xl border border-slate-800/80 bg-gradient-to-r from-slate-950/95 via-slate-900/90 to-slate-950/95 p-4">
          <form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-3"
          >
            <input
              className="flex-1 rounded-xl bg-black/60 border border-slate-700/80 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-cyan-500/70 focus:border-cyan-500/60 transition"
              placeholder="输入以太坊钱包地址，例如 0xabc..."
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.5)] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "生成中..." : "生成报告"}
            </button>
          </form>
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </section>

        {report && (
          <section
            ref={reportRef}
            className="space-y-4 rounded-3xl bg-gradient-to-br from-slate-950/90 via-slate-950/95 to-black/95 p-4 border border-slate-900/80"
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-950/95 via-zinc-900/90 to-slate-950/95 p-4 shadow-[0_0_40px_rgba(15,23,42,0.8)]">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold">整体概览</h2>
                  <div className="flex items-center gap-2">
                    <RiskBadge level={report.risk.level} />
                    <TagBadge>{report.risk.personaType}</TagBadge>
                  </div>
                </div>
                <p className="text-xs text-slate-300 mb-3">
                  {report.summary.text}
                </p>
                <div className="grid grid-cols-3 gap-3 text-xs text-slate-300">
                  <div>
                    <p className="text-slate-400">钱包地址</p>
                    <p className="font-mono text-[11px] break-all">
                      {report.address}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">总资产估值</p>
                    <p className="font-semibold">
                      ${formatUsd(report.assets.totalValue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">报告生成时间</p>
                    <p>{formatDate(report.meta.generatedAt)}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-950/95 via-zinc-900/90 to-slate-950/95 p-4 text-xs text-slate-300">
                  <p className="text-slate-400 mb-1">身份信息</p>
                  <p className="mb-1">
                    类型：{report.identity.isContract ? "合约地址" : "普通钱包"}
                  </p>
                  <p>创建时间：{formatDate(report.identity.createdAt)}</p>
                </div>
                <AllocationCard report={report} />
                <HoldingsCard report={report} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ActivityCard report={report} />
              <GasCard report={report} />
              <RiskCard report={report} />
            </div>

            {TG_CHANNEL_HANDLE && tgChannelUrl && (
              <div className="mt-2 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-slate-950 via-slate-900/90 to-slate-950 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-emerald-300">
                    想看更多典型钱包体检 & 高级功能内测？
                  </p>
                  <p className="text-[11px] text-slate-300 mt-1">
                    关注 Telegram 频道{" "}
                    <span className="font-mono text-emerald-300">
                      {TG_CHANNEL_HANDLE}
                    </span>
                    ，获取后续更新与 Pro 版进展。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={tgChannelUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-full bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-slate-950 shadow-[0_0_18px_rgba(16,185,129,0.6)] hover:bg-emerald-400 transition-colors"
                  >
                    打开频道
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyChannel}
                    className="inline-flex items-center rounded-full border border-emerald-400/70 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20 transition-colors"
                  >
                    复制频道名
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}