// app/stats926498/page.tsx
"use client";

import { useEffect, useState } from "react";

type Stats = {
  day: string;
  totalRequests: number;
  totalUniqueAddresses: number;
  todayRequests: number;
  todayUniqueAddresses: number;
};

export default function Stats926498Page() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);

  // 输入正确密码后，开始定时拉取统计数据
  useEffect(() => {
    if (!authorized) return;

    const fetchStats = async () => {
      try {
        setError(null);
        const res = await fetch(
          `/api/stats?token=${encodeURIComponent(password)}`
        );
        if (!res.ok) {
          if (res.status === 401) {
            setAuthorized(false);
            setStats(null);
            setError("访问已失效，请重新输入密码。");
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        setStats(data);
      } catch (err: any) {
        console.error(err);
        setError(err?.message || "加载统计数据失败");
      }
    };

    // 立即拉一次
    fetchStats();
    // 每 10 秒刷新一次
    const timer = setInterval(fetchStats, 10_000);
    return () => clearInterval(timer);
  }, [authorized, password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/stats?token=${encodeURIComponent(password)}`
      );
      if (!res.ok) {
        if (res.status === 401) {
          setError("密码错误，请重试。");
          setAuthorized(false);
          setStats(null);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setStats(data);
      setAuthorized(true);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "验证失败，请稍后再试。");
      setAuthorized(false);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
        <h1 className="text-lg font-semibold mb-4">
          WalletAudit 使用统计（内部）
        </h1>

        {/* 未授权：显示密码输入框 */}
        {!authorized && (
          <form onSubmit={handleSubmit} className="space-y-3 mb-4">
            <div className="space-y-1">
              <label className="block text-sm text-slate-300">
                请输入访问密码
              </label>
              <input
                type="password"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="访问密码"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full rounded-lg bg-emerald-500/90 hover:bg-emerald-400 text-slate-900 text-sm font-medium py-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "验证中..." : "进入统计面板"}
            </button>
            {error && (
              <p className="text-xs text-red-400 break-all">错误：{error}</p>
            )}
          </form>
        )}

        {/* 已授权：显示统计数据 */}
        {authorized && (
          <>
            {error && (
              <p className="text-sm text-red-400 mb-3">错误：{error}</p>
            )}
            {!stats ? (
              <p className="text-sm text-slate-400">加载中...</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">今天日期</span>
                  <span>{stats.day}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">总调用次数</span>
                  <span>{stats.totalRequests}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">总去重地址数</span>
                  <span>{stats.totalUniqueAddresses}</span>
                </div>
                <div className="h-px bg-slate-800 my-2" />
                <div className="flex justify-between">
                  <span className="text-slate-400">今日调用次数</span>
                  <span>{stats.todayRequests}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">今日去重地址数</span>
                  <span>{stats.todayUniqueAddresses}</span>
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  说明：统计只包含线上环境（Vercel）生成成功的报告，本地调试不计入。
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}