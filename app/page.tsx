"use client";

import { useState } from "react";

type AllocationItem = {
  category: string;
  value: number;
  ratio: number;
};

type Position = {
  symbol: string;
  amount: number;
  value: number;
};

type GasTx = {
  hash: string;
  gasEth: number;
};

type GasStats = {
  txCount: number;
  totalGasEth: number;
  totalGasUsd: number;
  topTxs: GasTx[];
};

type HistoryPoint = {
  timestamp: number;
  totalValue: number;
};

type MetaInfo = {
  fromCache?: boolean;
  generatedAt: number;
  previousValue: number | null;
  valueChange: number | null;
  valueChangePct: number | null;
  history: HistoryPoint[];
};

type ShareInfo = {
  shortAddr: string;
  ethAmount: number;
  ethPrice: number;
  totalValue: number;
  valueChange: number | null;
  valueChangePct: number | null;
  timestamp: number;
};

type ReportResponse = {
  address: string;
  totalValue: number;
  positions: Position[];
  allocation: AllocationItem[];
  otherTokens: {
    symbol: string;
    amount: number;
    value: number;
    hasPrice?: boolean;
  }[];
  gas: GasStats;
  meta: MetaInfo;
  share: ShareInfo;
};

export default function HomePage() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = address.trim();
    if (!trimmed || !trimmed.startsWith("0x")) {
      setError("请输入正确的以 0x 开头的钱包地址");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ address: trimmed }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error || "审计失败，请稍后重试");
        setReport(null);
        return;
      }

      const data = (await res.json()) as ReportResponse;
      setReport(data);
    } catch (err) {
      console.error(err);
      setError("请求失败，可能是网络或代理问题");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  function formatUsd(value: number) {
    if (!Number.isFinite(value)) return "-";
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  }

  function formatPct(ratio: number | null | undefined) {
    if (ratio == null || !Number.isFinite(ratio)) return "-";
    return (ratio * 100).toFixed(2) + "%";
  }

  function formatDateTime(ts: number) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${h}:${min}`;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center px-4 py-10">
      {/* 顶部标题 */}
      <div className="w-full max-w-3xl mb-8 text-center">
        <h1 className="text-2xl font-semibold mb-2">
          链上钱包审计报告生成器
        </h1>
        <p className="text-sm text-slate-300">
          输入任意以太坊地址，自动生成资产构成 + 风险分布 + Gas 体检报告
        </p>
      </div>

      {/* 输入区域 */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-3xl bg-slate-900/70 border border-slate-700 rounded-xl p-4 mb-6 flex flex-col gap-3"
      >
        <label className="text-sm text-slate-200">
          钱包地址（Ethereum Mainnet）
        </label>
        <input
          className="w-full rounded-lg px-3 py-2 bg-slate-950 border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="例如：0x28c6c06298d514db089934071355e5743bf21d60"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />

        {error && (
          <div className="text-xs text-red-400 bg-red-950/40 border border-red-700 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="self-start mt-1 inline-flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-slate-950"
        >
          {loading ? "生成中..." : "生成审计报告"}
        </button>

        {report?.meta && (
          <p className="text-[11px] text-slate-400 mt-1">
            最近一次生成：{formatDateTime(report.meta.generatedAt)}{" "}
            {report.meta.fromCache ? "(缓存命中，秒级返回)" : ""}
          </p>
        )}
      </form>

      {/* 没有报告时的占位提示 */}
      {!report && !loading && (
        <div className="w-full max-w-3xl text-xs text-slate-400 text-center">
          说明：本工具会从以太坊主网读取你的 ETH 与 ERC20 资产、估算美元价值，并统计 Gas
          总支出，仅做信息展示，不构成投资建议。
        </div>
      )}

      {/* 报告主体 */}
      {report && (
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
          {/* 左：总览 + 分布 */}
          <section className="lg:col-span-1 space-y-4">
            {/* 总资产卡片 */}
            <div className="bg-slate-900/80 border border-slate-700 rounded-xl p-4">
              <h2 className="text-sm font-semibold mb-2">审计摘要</h2>
              <p className="text-xs text-slate-400 mb-1 break-all">
                地址：{report.share.shortAddr}
              </p>
              <p className="text-xs text-slate-400 mb-3">
                生成时间：{formatDateTime(report.meta.generatedAt)}
              </p>
              <div className="text-3xl font-bold mb-2">
                {formatUsd(report.totalValue)}
              </div>
              {report.meta.previousValue != null && (
                <div className="text-xs text-slate-300">
                  相比上一次：
                  {report.meta.valueChange != null
                    ? `${report.meta.valueChange >= 0 ? "+" : ""}${formatUsd(
                        report.meta.valueChange
                      )}（${formatPct(
                        report.meta.valueChangePct
                      )}）`
                    : "—"}
                </div>
              )}
            </div>

            {/* 资产配置分布 */}
            <div className="bg-slate-900/80 border border-slate-700 rounded-xl p-4">
              <h2 className="text-sm font-semibold mb-2">
                资产配置与风险视图
              </h2>
              {report.allocation.length === 0 ? (
                <p className="text-xs text-slate-400">暂无可识别资产。</p>
              ) : (
                <ul className="space-y-1">
                  {report.allocation.map((a) => (
                    <li
                      key={a.category}
                      className="flex items-center justify-between text-xs"
                    >
                      <span>{a.category}</span>
                      <span className="text-slate-300">
                        {formatUsd(a.value)}（{formatPct(a.ratio)}）
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Gas 体检 */}
            <div className="bg-slate-900/80 border border-slate-700 rounded-xl p-4">
              <h2 className="text-sm font-semibold mb-2">Gas 体检报告</h2>
              <p className="text-xs text-slate-300 mb-1">
                历史交易笔数：{report.gas.txCount}
              </p>
              <p className="text-xs text-slate-300 mb-2">
                累计 Gas 消耗：{report.gas.totalGasEth.toFixed(4)} ETH（
                {formatUsd(report.gas.totalGasUsd)}）
              </p>
              <p className="text-[11px] text-slate-400 mb-1">
                最贵的 3 笔交易：
              </p>
              {report.gas.topTxs.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  暂无可统计交易记录。
                </p>
              ) : (
                <ul className="space-y-1">
                  {report.gas.topTxs.map((tx) => (
                    <li key={tx.hash} className="text-[11px]">
                      <a
                        href={`https://etherscan.io/tx/${tx.hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline text-emerald-400"
                      >
                        {tx.hash.slice(0, 10)}...
                      </a>{" "}
                      — Gas：{tx.gasEth.toFixed(5)} ETH
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* 右：持仓明细 + 历史 */}
          <section className="lg:col-span-2 space-y-4">
            {/* 持仓构成 */}
            <div className="bg-slate-900/80 border border-slate-700 rounded-xl p-4">
              <h2 className="text-sm font-semibold mb-2">持仓明细</h2>
              {report.positions.length === 0 ? (
                <p className="text-xs text-slate-400">
                  未检测到可识别的 ETH 或 Token 资产。
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-700 text-slate-300">
                        <th className="text-left py-1 pr-4">资产</th>
                        <th className="text-right py-1 pr-4">数量</th>
                        <th className="text-right py-1">估值（USD）</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.positions.map((p) => (
                        <tr
                          key={p.symbol}
                          className="border-b border-slate-800 last:border-b-0"
                        >
                          <td className="py-1 pr-4">{p.symbol}</td>
                          <td className="py-1 pr-4 text-right">
                            {p.amount.toPrecision(6)}
                          </td>
                          <td className="py-1 text-right">
                            {formatUsd(p.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {report.otherTokens.length > 0 && (
                <p className="text-[11px] text-slate-500 mt-2">
                  另有 {report.otherTokens.length} 个价格较小或暂未识别价格的
                  Token 已折叠为“长尾资产”，未逐一展示。
                </p>
              )}
            </div>

            {/* 简单历史趋势（表格版） */}
            <div className="bg-slate-900/80 border border-slate-700 rounded-xl p-4">
              <h2 className="text-sm font-semibold mb-2">历史审计记录</h2>
              {report.meta.history.length <= 1 ? (
                <p className="text-xs text-slate-400">
                  当前仅记录到 1 次审计，后续重复查询同一地址会自动累计历史轨迹。
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-700 text-slate-300">
                        <th className="text-left py-1 pr-4">时间</th>
                        <th className="text-right py-1">总资产（USD）</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.meta.history.map((h) => (
                        <tr
                          key={h.timestamp}
                          className="border-b border-slate-800 last:border-b-0"
                        >
                          <td className="py-1 pr-4">
                            {formatDateTime(h.timestamp)}
                          </td>
                          <td className="py-1 text-right">
                            {formatUsd(h.totalValue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}