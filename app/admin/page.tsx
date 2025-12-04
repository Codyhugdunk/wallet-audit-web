"use client";

import { useEffect, useState } from "react";
import type React from "react";

/* ------------------------------
 * 类型定义（前端安全结构）
 * ------------------------------ */
type DailyItem = {
  date: string;
  count: number;
};

type WalletItem = {
  address: string;
  count: number;
  lastAt: number;
};

type StatsResponse = {
  totalReports: number;        // 累计生成报告（映射自 pv 或 totalReports）
  uniqueWallets: number;       // 累计独立钱包数
  todayActiveWallets: number;  // 今日活跃钱包数
  daily: DailyItem[];
  topWallets: WalletItem[];
};

/* ------------------------------
 * 后端原始 /api/report/stats 返回结构
 * ------------------------------ */
type RawDaily = { date?: string; count?: number };
type RawWallet = { address?: string; count?: number; lastAt?: number; lastTimestamp?: number };

type RawStats = {
  pv?: number;
  totalReports?: number;
  uniqueWallets?: number;
  uniqueWalletCount?: number;
  todayActiveWallets?: number;
  daily?: RawDaily[];
  topWallets?: RawWallet[];
};

const ADMIN_PASS = "14253678";

/* ------------------------------
 * 组件主体
 * ------------------------------ */
export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  /* ------------------------------ 工具函数 ------------------------------ */
  function formatDateTime(ts: number) {
    if (!ts) return "-";
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes()
    ).padStart(2, "0")}`;
  }

  /* ------------------------------ 加载统计 ------------------------------ */
  async function loadStats() {
    try {
      setLoading(true);
      setStatsError(null);

      const res = await fetch("/api/report/stats");
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setStatsError(data.error || "获取统计数据失败");
        setStats(null);
        return;
      }

      const raw = (await res.json()) as RawStats;

      /* ------------------------------
       * 字段兼容与安全映射
       * ------------------------------ */
      const safe: StatsResponse = {
        totalReports:
          typeof raw.totalReports === "number"
            ? raw.totalReports
            : typeof raw.pv === "number"
            ? raw.pv
            : 0,

        uniqueWallets:
          typeof raw.uniqueWallets === "number"
            ? raw.uniqueWallets
            : typeof raw.uniqueWalletCount === "number"
            ? raw.uniqueWalletCount
            : 0,

        todayActiveWallets:
          typeof raw.todayActiveWallets === "number" ? raw.todayActiveWallets : 0,

        daily: Array.isArray(raw.daily)
          ? raw.daily
              .map((d) => ({
                date: typeof d.date === "string" ? d.date : "",
                count: typeof d.count === "number" ? d.count : 0,
              }))
              .filter((d) => d.date)
          : [],

        topWallets: Array.isArray(raw.topWallets)
          ? raw.topWallets
              .map((w) => ({
                address: typeof w.address === "string" ? w.address : "",
                count: typeof w.count === "number" ? w.count : 0,
                lastAt:
                  typeof w.lastAt === "number"
                    ? w.lastAt
                    : typeof w.lastTimestamp === "number"
                    ? w.lastTimestamp
                    : 0,
              }))
              .filter((w) => w.address)
          : [],
      };

      setStats(safe);
    } catch (e) {
      console.error(e);
      setStatsError("请求失败，可能是网络或服务器问题");
      setStats(null);
    } finally {
      setLoading(false);
    }
  }

  /* ------------------------------ 登录处理 ------------------------------ */
  function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password === ADMIN_PASS) {
      setAuthed(true);
    } else {
      setError("口令错误，请重试");
    }
  }

  useEffect(() => {
    if (authed) loadStats();
  }, [authed]);

  /* ------------------------------ 未登录界面 ------------------------------ */
  if (!authed) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-xl p-5">
          <h1 className="text-lg font-semibold mb-3 text-center">管理后台登录</h1>
          <p className="text-xs text-slate-400 mb-4 text-center">
            请输入后台口令以查看钱包审计统计数据
          </p>

          <form onSubmit={handleLogin} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-300">后台口令</label>
              <input
                type="password"
                className="w-full rounded-lg px-3 py-2 bg-slate-950 border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入口令"
              />
            </div>

            {error && (
              <div className="text-[11px] text-red-400 bg-red-950/40 border border-red-700 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full mt-1 inline-flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-400 px-4 py-2 text-sm font-medium text-slate-950"
            >
              进入后台
            </button>
          </form>
        </div>
      </main>
    );
  }

  /* ------------------------------ 已登录界面 ------------------------------ */
  const dailyList = stats?.daily ?? [];
  const walletList = stats?.topWallets ?? [];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-6 flex flex-col items-center">
      <div className="w-full max-w-5xl flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">链上审计 · 管理后台</h1>
          <p className="text-xs text-slate-400">正在加载统计数据...</p>
        </div>

        <button
          onClick={() => loadStats()}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100"
          disabled={loading}
        >
          {loading ? "刷新中..." : "刷新数据"}
        </button>
      </div>

      {statsError && (
        <div className="w-full max-w-5xl mb-4 text-xs text-red-400 bg-red-950/40 border border-red-700 rounded-md px-3 py-2">
          {statsError}
        </div>
      )}

      {!stats && !statsError && (
        <p className="text-xs text-slate-400">正在加载统计数据...</p>
      )}
    </main>
  );
}