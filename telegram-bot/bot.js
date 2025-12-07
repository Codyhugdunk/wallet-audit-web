// bot.js - WalletAudit v1.1 Telegram 机器人（带频道引流）
// 使用示例：node bot.js

const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');

// ===== ① 在这里填你的真实 Bot Token =====
const BOT_TOKEN = '8592506734:AAEVerAS9RYNE8h4QVAebNK0GULXCRQ9zoE';

// ===== ② Telegram 代理（如果你本机用 Clash）=====
const PROXY_URL = 'http://127.0.0.1:7897'; // 按你实际端口改
const tgAgent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : undefined;

// ===== ③ WalletAudit 线上审计接口地址 =====
const AUDIT_API_URL = 'https://www.walletaudit.me/api/report';

// ===== ④ 频道用户名（用于文案中展示）=====
const CHANNEL_HANDLE = 'https://t.me/walletaudit'; // 换成你的频道 username

// ===== 小工具函数 =====
function shortenAddress(addr) {
  if (!addr || addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function trimZero(numStr) {
  return numStr.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

// 金额短格式：统一用「万 / 亿」
function formatUsd(v) {
  if (!Number.isFinite(v) || v <= 0) return '0';
  if (v < 1_000) return trimZero(v.toFixed(2));
  if (v < 10_000) return String(Math.round(v));
  const wan = v / 10_000;
  if (wan < 10_000) return `${trimZero(wan.toFixed(2))}万`;
  const yi = wan / 10_000;
  return `${trimZero(yi.toFixed(2))}亿`;
}

function formatPct(ratio) {
  if (!Number.isFinite(ratio)) return '-';
  return (ratio * 100).toFixed(1).replace(/\.0$/, '') + '%';
}

async function fetchReport(address) {
  const url = `${AUDIT_API_URL}?address=${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    agent: tgAgent,
    timeout: 25_000,
  });

  if (!res.ok) {
    let msg = `接口返回错误：${res.status}`;
    try {
      const data = await res.json();
      if (data && data.error) msg = data.error;
    } catch (_) {}
    throw new Error(msg);
  }

  return res.json();
}

function buildSummaryText(report) {
  const addr =
    (report.share && report.share.shortAddr) ||
    shortenAddress(report.address) ||
    '未知地址';

  const totalValue =
    (report.assets && report.assets.totalValue) ||
    (report.share && report.share.totalValue) ||
    0;
  const totalText = formatUsd(totalValue);

  const risk = report.risk || {};
  const persona = risk.personaType || '钱包持仓地址';
  const score = risk.score ?? 0;
  const level = risk.level || 'Unknown';

  const stableRatio = risk.stableRatio ?? 0;
  const memeRatio = risk.memeRatio ?? 0;
  const otherRatio = risk.otherRatio ?? 0;

  const riskLabel =
    level === 'Low'
      ? '整体风险偏低'
      : level === 'High'
      ? '整体风险偏高'
      : level === 'Medium'
      ? '整体风险中等'
      : '';

  const activity = report.activity || {};
  const txCount = activity.txCount ?? 0;
  const activeDays = activity.activeDays ?? 0;
  const contracts = activity.contractsInteracted ?? 0;

  const gas = report.gas || {};
  const totalGasEth = gas.totalGasEth ?? 0;
  const totalGasUsd = gas.totalGasUsd ?? 0;

  const lines = [];

  // 报告抬头
  lines.push(`📊 WalletAudit 钱包体检报告（简版）`);
  lines.push(`地址：${addr}`);
  lines.push(
    `总资产估值：约 ${totalText} 美元 · 人格类型：${persona}`,
  );
  lines.push(
    `风险等级：${level} · 评分：${score}/100${
      riskLabel ? `（${riskLabel}）` : ''
    }`,
  );
  lines.push('');

  // 资产结构
  lines.push('💼 资产结构');
  const ethValue = report.assets?.eth?.value ?? 0;
  lines.push(`- ETH 估值：${formatUsd(ethValue)} 美元`);
  lines.push(`- 稳定币占比：${formatPct(stableRatio)}`);
  lines.push(`- Meme 占比：${formatPct(memeRatio)}`);
  lines.push(`- 其他资产占比：${formatPct(otherRatio)}`);
  lines.push('');

  // 行为画像
  lines.push('🧠 行为画像（近期）');
  if (txCount > 0) {
    lines.push(
      `- 统计期内交易笔数：${txCount} · 活跃天数：${activeDays}`,
    );
    lines.push(`- 交互过的合约/地址数量：${contracts}`);
  } else {
    lines.push('- 近期几乎没有主动交易行为');
  }
  lines.push('');

  // Gas 消耗
  lines.push('⛽ Gas 消耗（最近 50 笔）');
  lines.push(
    `- Gas 总消耗：${totalGasEth.toFixed(5)} ETH ≈ ${formatUsd(
      totalGasUsd,
    )} 美元`,
  );
  lines.push('');

  // 引流尾巴：网页 + 频道
  lines.push('🔗 网页版可视化报告：https://www.walletaudit.me/');
  if (CHANNEL_HANDLE) {
    lines.push(
      `📡 更多典型钱包体检 & 工具更新：${CHANNEL_HANDLE}`,
    );
  }

  return lines.join('\n');
}

// ===== 地址处理主逻辑 =====
async function handleAddress(ctx, address) {
  const shortAddr = shortenAddress(address);

  await ctx.reply(
    `⏳ 正在为地址 ${shortAddr} 生成审计报告，请稍候...`,
  );

  try {
    const report = await fetchReport(address);
    const text = buildSummaryText(report);
    await ctx.reply(text);
  } catch (err) {
    console.error('调用 WalletAudit 接口失败：', err);
    await ctx.reply(
      `❌ 生成失败：${
        err && err.message ? err.message : '未知错误'
      }`,
    );
  }
}

// ===== 启动 Telegraf Bot =====
if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_REAL_BOT_TOKEN_HERE') {
  console.error('请先在 bot.js 里把 BOT_TOKEN 替换成你的真实 Telegram Bot Token');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN, {
  telegram: {
    agent: tgAgent,
  },
});

// /start 命令
bot.start((ctx) => {
  return ctx.reply(
    [
      '👋 欢迎使用 WalletAudit · 链上钱包体检机器人',
      '',
      '发送任意以太坊地址（0x 开头，42 位），我会帮你生成一份包含：',
      '· 总资产 & 资产配置概览',
      '· 近期交易活跃度 & Gas 消耗',
      '· 风险评分 & 钱包人格标签',
      '',
      '你可以先用这些公开地址试一试：',
      '· 0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8',
      '· 0x28c6c06298d514db089934071355e5743bf21d60',
    ].join('\n'),
  );
});

// 统一入口：任何文本消息走这里，自己判断有没有地址
bot.on('text', async (ctx) => {
  const txt = (ctx.message.text || '').trim();
  console.log('收到一条文本消息：', txt);

  const match = txt.match(/0x[a-fA-F0-9]{40}/);
  if (!match) {
    return ctx.reply(
      '请发送一个以太坊地址（0x 开头，42 位），例如：\n0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8',
    );
  }

  const address = match[0];
  await handleAddress(ctx, address);
});

// 启动 bot
(async () => {
  console.log('Telegram bot 即将启动 (WalletAudit 正式版)...');
  await bot.launch();
  console.log('Telegram bot 已启动，按 Ctrl+C 停止。');
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));